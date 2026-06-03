import { env } from "@/lib/env";
import { ApiError, NetworkError } from "@/lib/api/error";
import type { ApiResponse } from "@/lib/api/types";
import { refreshTokens, InvalidCredentialsError, KeycloakConfigError } from "@/lib/auth/keycloak";
import { useAuthStore } from "@/store/authStore";

type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

const DEFAULT_TIMEOUT_MS = 30_000;

export interface RequestOptions {
  signal?: AbortSignal;
  headers?: Record<string, string>;
  query?: Record<string, string | number | boolean | undefined | null>;
  /** Bearer token. When omitted, the request is sent unauthenticated. */
  token?: string | null;
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

function combineSignals(caller?: AbortSignal, internal?: AbortSignal): AbortSignal | undefined {
  if (!caller) return internal;
  if (!internal) return caller;
  if (caller.aborted) return caller;
  if (internal.aborted) return internal;
  const merged = new AbortController();
  const onAbort = (e: Event) => merged.abort((e.target as AbortSignal).reason);
  caller.addEventListener("abort", onAbort, { once: true });
  internal.addEventListener("abort", onAbort, { once: true });
  return merged.signal;
}

/** Single in-flight refresh promise so concurrent 401s share one refresh. */
let inFlightRefresh: Promise<string | null> | null = null;

async function tryRefreshAccessToken(): Promise<string | null> {
  if (inFlightRefresh) return inFlightRefresh;
  const store = useAuthStore.getState();
  const current = store.refreshToken;
  if (!current) return null;
  if (store.refreshExpired()) {
    await store.clearSession();
    return null;
  }
  inFlightRefresh = (async () => {
    try {
      const raw = await refreshTokens(current);
      store.applyTokens(raw);
      // Keep the rotated token fresh on disk for the non-biometric cold boot.
      // The biometric key is left untouched to avoid a prompt on every refresh;
      // it's read once at boot and kept in memory thereafter (pitfall 6).
      if (!useAuthStore.getState().biometricEnabled) {
        await useAuthStore.getState().persistRefresh();
      }
      return useAuthStore.getState().accessToken;
    } catch (e) {
      if (e instanceof InvalidCredentialsError || e instanceof KeycloakConfigError) {
        await useAuthStore.getState().clearSession();
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
  if (body !== undefined) finalHeaders.set("Content-Type", "application/json");
  if (bearer) finalHeaders.set("Authorization", `Bearer ${bearer}`);

  const cap = timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const timeoutController = cap > 0 ? new AbortController() : null;
  const timeoutHandle = timeoutController ? setTimeout(() => timeoutController.abort(), cap) : null;
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
    if (cause instanceof Error && cause.name === "AbortError") {
      if (timeoutController?.signal.aborted && !signal?.aborted) {
        throw new NetworkError(`Request timed out after ${cap}ms`);
      }
      throw cause;
    }
    throw new NetworkError(cause instanceof Error ? cause.message : "Network request failed");
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
  const initialBearer = options.token ?? useAuthStore.getState().accessToken ?? null;

  let { status, payload } = await rawFetch<T>(path, options, initialBearer);

  if (status === 401 && options.token === undefined) {
    const fresh = await tryRefreshAccessToken();
    if (fresh) ({ status, payload } = await rawFetch<T>(path, options, fresh));
  }

  const ok = status >= 200 && status < 300 && payload?.success !== false;
  if (!ok) {
    throw new ApiError(status, payload?.message ?? "Request failed", payload?.errorCode);
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
