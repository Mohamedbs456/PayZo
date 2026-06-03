/**
 * Backoffice roles emitted by Keycloak in the JWT's `realm_access.roles` claim.
 * Mirrors the role table in architecture.md §9 (without the Spring `ROLE_` prefix
 * — Spring adds that during conversion server-side).
 */
export type BoRole = "ADMIN" | "ANALYST" | "SUPERADMIN";

export const BO_ROLES: readonly BoRole[] = ["ADMIN", "ANALYST", "SUPERADMIN"];

/** Decoded subset of the Keycloak access-token payload we actually use. */
export interface JwtClaims {
  sub: string;
  exp: number; // seconds since epoch
  iat: number;
  iss: string;
  preferred_username?: string;
  email?: string;
  given_name?: string;
  family_name?: string;
  realm_access?: { roles?: string[] };
}

/** Persisted token bundle held in sessionStorage. */
export interface TokenBundle {
  accessToken: string;
  refreshToken: string;
  /** Absolute expiry (ms since epoch) — derived from `expires_in` at issue time. */
  accessExpiresAt: number;
  refreshExpiresAt: number;
}

/** What a logged-in caller sees after the access-token is decoded. */
export interface AuthSession {
  tokens: TokenBundle;
  userId: string;
  username: string;
  roles: BoRole[];
}
