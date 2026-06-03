import { decodeJwt, extractClientRoles } from "@/lib/auth/jwt";
import type { AuthSession, TokenBundle } from "@/lib/auth/types";
import { broadcastSessionChange } from "@/lib/auth/useCrossTabLogout";

/** sessionStorage-backed token store for the client realm, with login / logout broadcast for cross-tab sync. */

const STORAGE_KEY = "payzo.client.session.v1";

interface StoredPayload {
  tokens: TokenBundle;
}

function read(): StoredPayload | null {
  if (typeof window === "undefined") return null;
  const raw = sessionStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredPayload;
  } catch {
    sessionStorage.removeItem(STORAGE_KEY);
    return null;
  }
}

function write(payload: StoredPayload) {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

/** Build an AuthSession from a token bundle by decoding the access token. */
function deriveSession(tokens: TokenBundle): AuthSession {
  const claims = decodeJwt(tokens.accessToken);
  return {
    tokens,
    userId: claims.sub,
    username: claims.preferred_username ?? claims.sub,
    roles: extractClientRoles(claims),
  };
}

/** Convert a Keycloak token response into a stored bundle with absolute expiries. */
export function bundleFromRaw(raw: {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  refresh_expires_in: number;
}): TokenBundle {
  const now = Date.now();
  return {
    accessToken: raw.access_token,
    refreshToken: raw.refresh_token,
    accessExpiresAt: now + raw.expires_in * 1000,
    refreshExpiresAt: now + raw.refresh_expires_in * 1000,
  };
}

export const session = {
  get(): AuthSession | null {
    const stored = read();
    if (!stored) return null;
    if (stored.tokens.refreshExpiresAt <= Date.now()) {
      // Refresh token has expired — session is unrecoverable.
      sessionStorage.removeItem(STORAGE_KEY);
      return null;
    }
    try {
      return deriveSession(stored.tokens);
    } catch (e) {
      // JWT decode failed — token is malformed, signature payload truncated,
      // or the JwtClaims shape on the server changed. Wipe the session so the
      // user can re-login cleanly, but log it loud first so this doesn't
      // silently boot every user the day an upstream token format shifts.
      // eslint-disable-next-line no-console
      console.warn("[session] JWT decode failed — clearing session:", e);
      sessionStorage.removeItem(STORAGE_KEY);
      return null;
    }
  },
  put(tokens: TokenBundle): AuthSession {
    write({ tokens });
    // Tell sibling tabs a (possibly different) user just signed in so they
    // can drop any cached MeProvider state for the previous identity.
    broadcastSessionChange("login");
    return deriveSession(tokens);
  },
  clear() {
    if (typeof window === "undefined") return;
    sessionStorage.removeItem(STORAGE_KEY);
    // Tell sibling tabs the session is gone so they bounce to /login
    // instead of continuing to call the API with a now-revoked token.
    broadcastSessionChange("logout");
  },
  isAuthenticated(): boolean {
    return this.get() !== null;
  },
};

// ─── Role helpers ─────────────────────────────────────────────────────────────
// The client app only has one role today (CLIENT). Helpers exist for symmetry
// with the backoffice and to leave room for future role splits (e.g. merchant).

export const isClient = (s: AuthSession | null = session.get()) =>
  !!s?.roles.includes("CLIENT");
