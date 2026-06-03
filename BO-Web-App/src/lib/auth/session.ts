import { decodeJwt, extractBoRoles } from "@/lib/auth/jwt";
import type { AuthSession, BoRole, TokenBundle } from "@/lib/auth/types";

/** sessionStorage-backed token store for the backoffice realm, with {@link BoRole}-narrowing helpers exposed below. */

const STORAGE_KEY = "payzo.bo.session.v1";

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
    roles: extractBoRoles(claims),
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
    } catch {
      sessionStorage.removeItem(STORAGE_KEY);
      return null;
    }
  },
  put(tokens: TokenBundle): AuthSession {
    write({ tokens });
    return deriveSession(tokens);
  },
  clear() {
    if (typeof window === "undefined") return;
    sessionStorage.removeItem(STORAGE_KEY);
  },
  isAuthenticated(): boolean {
    return this.get() !== null;
  },
};

// ─── Role helpers ─────────────────────────────────────────────────────────────
// Single source of truth — every page/component should call these instead of
// `roles.includes(...)` ad-hoc, so the role precedence (SA > Admin > Analyst)
// stays consistent everywhere.

export const isSuperAdmin = (s: AuthSession | null = session.get()) =>
  !!s?.roles.includes("SUPERADMIN");
export const isAdmin = (s: AuthSession | null = session.get()) =>
  !!s?.roles.includes("ADMIN");
export const isAnalyst = (s: AuthSession | null = session.get()) =>
  !!s?.roles.includes("ANALYST");

/**
 * Resolves the *primary* role for the user — when Keycloak assigns multiple,
 * SA wins, then Admin, then Analyst. Drives sidebar nav, dashboard layout,
 * and route guards.
 */
export function primaryRole(
  s: AuthSession | null = session.get(),
): BoRole | null {
  if (isSuperAdmin(s)) return "SUPERADMIN";
  if (isAdmin(s)) return "ADMIN";
  if (isAnalyst(s)) return "ANALYST";
  return null;
}

const ROLE_LABELS: Record<BoRole, string> = {
  SUPERADMIN: "Super Admin",
  ADMIN: "Admin",
  ANALYST: "Analyst",
};

export function roleLabel(s: AuthSession | null = session.get()): string {
  const role = primaryRole(s);
  return role ? ROLE_LABELS[role] : "";
}
