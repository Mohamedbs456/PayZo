/**
 * Realm role emitted by Keycloak for client (end-user) accounts in the JWT's
 * `realm_access.roles` claim. Mirrors the `CLIENT` realm role defined in
 * `Keycloak/realms/clients-realm.json`.
 *
 * The backoffice (Admin / Analyst / SuperAdmin) is a separate realm with its
 * own roles — we never see those in this app.
 */
export type ClientRole = "CLIENT";

export const CLIENT_ROLES: readonly ClientRole[] = ["CLIENT"];

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
  roles: ClientRole[];
}
