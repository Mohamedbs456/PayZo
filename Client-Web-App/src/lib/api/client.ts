/**
 * Fetch wrapper for the PayZo backend. Auto-attaches the session bearer when
 * one is set, deduplicates concurrent 401-driven refreshes via a single
 * in-flight promise, then replays the original request with the new bearer
 * (once). Caller-provided tokens bypass the auto-attach and the auto-retry,
 * since callers doing their own auth dance (signup, OTP verify) shouldn't be
 * second-guessed.
 */
import { env } from "@/lib/env";
import { ApiError, NetworkError } from "@/lib/api/error";
import type { ApiResponse } from "@/lib/api/types";
import { session, bundleFromRaw } from "@/lib/auth/session";
import {
  refreshTokens,
  InvalidCredentialsError,
  KeycloakConfigError,
} from "@/lib/auth/keycloak";

type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

/** Hard cap on a single fetch attempt. Beyond this the AbortController
 *  fires and the request becomes a NetworkError("timeout"). Set high enough
 *  that healthy backend calls never trip it, low enough that a hung backend
 *  doesn't leave the UI in a loading spinner forever. */
const DEFAULT_TIMEOUT_MS = 30_000;

export interface RequestOptions {
  signal?: AbortSignal;
  headers?: Record<string, string>;
  query?: Record<string, string | number | boolean | undefined | null>;
  /** Bearer token. When omitted, the request is sent unauthenticated. */
  token?: string | null;
  /** Override the default 30s timeout. Pass 0 to disable (use sparingly —
   *  long-running endpoints should be chunked or polled instead). */
  timeoutMs?: number;
}

interface InternalOptions extends RequestOptions {
  method: Method;
  body?: unknown;
}

function buildUrl(path: string, query?: RequestOptions["query"]): string {
  const url = new URL(`${env.apiBaseUrl}${path}`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null) continue;
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

/** Polyfill-friendly AbortSignal merger. AbortSignal.any() exists in modern
 *  browsers but isn't universal yet — manually wire the listeners so an
 *  abort on either signal aborts our internal one. */
function combineSignals(
  caller?: AbortSignal,
  internal?: AbortSignal,
): AbortSignal | undefined {
  if (!caller) return internal;
  if (!internal) return caller;
  const merged = new AbortController();
  const onAbort = (e: Event) => merged.abort((e.target as AbortSignal).reason);
  if (caller.aborted) return caller;
  if (internal.aborted) return internal;
  caller.addEventListener("abort", onAbort, { once: true });
  internal.addEventListener("abort", onAbort, { once: true });
  return merged.signal;
}

/** Single in-flight refresh promise so concurrent 401s share one refresh. */
let inFlightRefresh: Promise<string | null> | null = null;

async function tryRefreshAccessToken(): Promise<string | null> {
  if (inFlightRefresh) return inFlightRefresh;
  const current = session.get();
  if (!current) return null;
  if (current.tokens.refreshExpiresAt <= Date.now()) {
    session.clear();
    return null;
  }
  inFlightRefresh = (async () => {
    try {
      const raw = await refreshTokens(current.tokens.refreshToken);
      const bundle = bundleFromRaw(raw);
      session.put(bundle);
      return bundle.accessToken;
    } catch (e) {
      // Only clear the session when it's GENUINELY over (refresh token
      // revoked/expired) or when Keycloak rejected the client config.
      // Transient KeycloakUnreachableError means a 5xx hiccup or network
      // blip — keep the session, let the next API call retry. Without this
      // a 2-second KC outage silently logged users out.
      if (e instanceof InvalidCredentialsError || e instanceof KeycloakConfigError) {
        session.clear();
      }
      return null;
    } finally {
      inFlightRefresh = null;
    }
  })();
  return inFlightRefresh;
}

async function rawFetch<T>(
  path: string,
  options: InternalOptions,
  bearer: string | null,
): Promise<{ status: number; payload: ApiResponse<T> | null }> {
  const { method, body, signal, headers, query, timeoutMs } = options;
  const finalHeaders = new Headers(headers);
  if (body !== undefined) {
    finalHeaders.set("Content-Type", "application/json");
  }
  if (bearer) {
    finalHeaders.set("Authorization", `Bearer ${bearer}`);
  }

  // Hook our timeout into the caller's AbortSignal (if any) so either side
  // can abort. Without this, a hung backend hangs the request forever and
  // every loading spinner in the UI gets stuck.
  const cap = timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const timeoutController = cap > 0 ? new AbortController() : null;
  const timeoutHandle = timeoutController
    ? setTimeout(() => timeoutController.abort(), cap)
    : null;
  const combinedSignal = combineSignals(signal, timeoutController?.signal);

  let response: Response;
  try {
    response = await fetch(buildUrl(path, query), {
      method,
      headers: finalHeaders,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: combinedSignal,
    });
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === "AbortError") {
      // If our internal timeout fired, surface it as NetworkError so callers
      // get a uniform handle. A caller-driven abort keeps the original error.
      if (timeoutController?.signal.aborted && !signal?.aborted) {
        throw new NetworkError(`Request timed out after ${cap}ms`);
      }
      throw cause;
    }
    throw new NetworkError(
      cause instanceof Error ? cause.message : "Network request failed",
    );
  } finally {
    if (timeoutHandle !== null) clearTimeout(timeoutHandle);
  }

  let payload: ApiResponse<T> | null = null;
  try {
    payload = (await response.json()) as ApiResponse<T>;
  } catch {
    // Non-JSON or empty body — fall through to status-based error.
  }

  return { status: response.status, payload };
}

async function request<T>(path: string, options: InternalOptions): Promise<T> {
  // Explicit token wins; otherwise auto-attach the active session's bearer.
  const initialBearer =
    options.token ?? session.get()?.tokens.accessToken ?? null;

  let { status, payload } = await rawFetch<T>(path, options, initialBearer);

  // 401 → try to refresh once, then replay the request with the new bearer.
  // We only retry when there's no caller-provided token (otherwise the caller
  // is doing their own auth dance and we shouldn't second-guess).
  if (status === 401 && options.token === undefined) {
    const fresh = await tryRefreshAccessToken();
    if (fresh) {
      ({ status, payload } = await rawFetch<T>(path, options, fresh));
    }
  }

  const ok = status >= 200 && status < 300 && payload?.success !== false;
  if (!ok) {
    throw new ApiError(
      status,
      payload?.message ?? "Request failed",
      payload?.errorCode,
    );
  }

  return (payload?.data ?? null) as T;
}

export const api = {
  get: <T>(path: string, opts: RequestOptions = {}) =>
    request<T>(path, { ...opts, method: "GET" }),
  post: <T>(path: string, body?: unknown, opts: RequestOptions = {}) =>
    request<T>(path, { ...opts, method: "POST", body }),
  put: <T>(path: string, body?: unknown, opts: RequestOptions = {}) =>
    request<T>(path, { ...opts, method: "PUT", body }),
  patch: <T>(path: string, body?: unknown, opts: RequestOptions = {}) =>
    request<T>(path, { ...opts, method: "PATCH", body }),
  delete: <T>(path: string, opts: RequestOptions = {}) =>
    request<T>(path, { ...opts, method: "DELETE" }),
};
