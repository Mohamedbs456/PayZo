export type ClientRole = "CLIENT";

export const CLIENT_ROLES: readonly ClientRole[] = ["CLIENT"];

export interface JwtClaims {
  sub: string;
  exp: number;
  iat: number;
  iss: string;
  preferred_username?: string;
  email?: string;
  given_name?: string;
  family_name?: string;
  realm_access?: { roles?: string[] };
}

export interface TokenBundle {
  accessToken: string;
  refreshToken: string;
  /** Absolute expiry (ms since epoch), derived from expires_in at issue time. */
  accessExpiresAt: number;
  refreshExpiresAt: number;
}

export interface AuthSession {
  tokens: TokenBundle;
  userId: string;
  username: string;
  roles: ClientRole[];
}
