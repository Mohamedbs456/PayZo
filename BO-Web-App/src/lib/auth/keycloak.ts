/**
 * Direct Keycloak Resource-Owner Password Credentials wrapper. Mints the
 * initial access + refresh pair, refreshes them later when the api client
 * signals expiry. Targets the backoffice realm here (clients realm on the
 * customer app, never mixed). Custom Error subclasses let the LoginForm
 * tell user-typed-wrong-password apart from Keycloak-is-down.
 */
import { env } from "@/lib/env";

interface RawTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number; // seconds
  refresh_expires_in: number;
  token_type: "Bearer";
}

/** Distinguishable failure modes for the login form. */
export class InvalidCredentialsError extends Error {
  constructor() {
    super("Invalid username or password");
    this.name = "InvalidCredentialsError";
  }
}

export class AccountDisabledError extends Error {
  constructor(message = "Account is not active") {
    super(message);
    this.name = "AccountDisabledError";
  }
}

export class KeycloakUnreachableError extends Error {
  constructor(cause?: unknown) {
    super("Keycloak unreachable");
    this.name = "KeycloakUnreachableError";
    if (cause instanceof Error) this.cause = cause;
  }
}

/**
 * Configuration error raised by Keycloak — wrong client secret, ROPC disabled
 * on the client, etc. This is a developer-side problem, NOT a network outage,
 * so we surface it distinctly from KeycloakUnreachableError.
 */
export class KeycloakConfigError extends Error {
  readonly errorCode: string;
  readonly description: string;
  constructor(errorCode: string, description: string) {
    super(description || errorCode);
    this.name = "KeycloakConfigError";
    this.errorCode = errorCode;
    this.description = description;
  }
}

interface KeycloakErrorBody {
  error?: string;
  error_description?: string;
}

/**
 * Resource-owner password credentials grant against the backoffice realm.
 * Returns the raw KC payload so the caller can compute absolute expiries
 * with a single Date.now() reading.
 */
export async function ropcLogin(
  username: string,
  password: string,
): Promise<RawTokenResponse> {
  const tokenUrl = `${env.keycloak.url}/realms/${env.keycloak.realm}/protocol/openid-connect/token`;

  const body = new URLSearchParams({
    grant_type: "password",
    client_id: env.keycloak.clientId,
    username,
    password,
  });
  if (env.keycloak.clientSecret) {
    body.set("client_secret", env.keycloak.clientSecret);
  }

  let response: Response;
  try {
    response = await fetch(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
  } catch (cause) {
    throw new KeycloakUnreachableError(cause);
  }

  if (response.ok) {
    return (await response.json()) as RawTokenResponse;
  }

  // Map Keycloak error responses. KC uses 401/400 with a JSON body that contains
  // { error, error_description }.
  const payload = (await response
    .json()
    .catch(() => null)) as KeycloakErrorBody | null;
  const errorCode = payload?.error;
  const description = payload?.error_description ?? "";

  // Wrong username or password — KC returns 401 invalid_grant.
  // Both "Invalid user credentials" and missing-user produce the same code,
  // which is intentional (anti-enumeration).
  if (errorCode === "invalid_grant") {
    // KC also uses invalid_grant for "Account is not fully set up" / disabled.
    if (/disabled|not fully set up|locked/i.test(description)) {
      throw new AccountDisabledError(description);
    }
    throw new InvalidCredentialsError();
  }

  // Misconfigured client — wrong secret, ROPC off, public/confidential mismatch.
  // These are developer-side issues; we keep them distinct from network outages
  // so the UI doesn't lie about reachability.
  if (
    errorCode === "invalid_client" ||
    errorCode === "unauthorized_client"
  ) {
    throw new KeycloakConfigError(errorCode, description);
  }

  // 5xx and anything not categorized above — treat as KC down.
  throw new KeycloakUnreachableError(
    new Error(`Keycloak ${response.status}: ${description || errorCode || "unknown"}`),
  );
}

/**
 * Terminates the Keycloak SSO session by revoking the refresh token via the
 * end-session endpoint. Best-effort — local session is cleared regardless.
 */
export async function kcLogout(refreshToken: string): Promise<void> {
  const url = `${env.keycloak.url}/realms/${env.keycloak.realm}/protocol/openid-connect/logout`;
  const body = new URLSearchParams({
    client_id: env.keycloak.clientId,
    refresh_token: refreshToken,
  });
  if (env.keycloak.clientSecret) {
    body.set("client_secret", env.keycloak.clientSecret);
  }
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
  } catch {
    // Keycloak unreachable — local session still cleared by caller.
  }
}

/**
 * Refresh-token grant. Used for silent renewal when the access token is close
 * to expiring. Same error mapping as ropcLogin.
 */
export async function refreshTokens(refreshToken: string): Promise<RawTokenResponse> {
  const tokenUrl = `${env.keycloak.url}/realms/${env.keycloak.realm}/protocol/openid-connect/token`;
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: env.keycloak.clientId,
    refresh_token: refreshToken,
  });
  if (env.keycloak.clientSecret) {
    body.set("client_secret", env.keycloak.clientSecret);
  }

  let response: Response;
  try {
    response = await fetch(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
  } catch (cause) {
    throw new KeycloakUnreachableError(cause);
  }

  if (response.ok) return (await response.json()) as RawTokenResponse;
  throw new InvalidCredentialsError();
}
