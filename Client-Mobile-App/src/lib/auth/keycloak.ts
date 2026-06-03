import { env } from "@/lib/env";

export interface RawTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  refresh_expires_in: number;
  token_type: "Bearer";
}

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

function tokenUrl(): string {
  return `${env.keycloak.url}/realms/${env.keycloak.realm}/protocol/openid-connect/token`;
}

function baseBody(): URLSearchParams {
  const body = new URLSearchParams();
  body.set("client_id", env.keycloak.clientId);
  if (env.keycloak.clientSecret) body.set("client_secret", env.keycloak.clientSecret);
  return body;
}

async function exchange(body: URLSearchParams): Promise<RawTokenResponse> {
  let response: Response;
  try {
    response = await fetch(tokenUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
  } catch (cause) {
    throw new KeycloakUnreachableError(cause);
  }

  if (response.ok) return (await response.json()) as RawTokenResponse;

  const payload = (await response.json().catch(() => null)) as KeycloakErrorBody | null;
  const errorCode = payload?.error;
  const description = payload?.error_description ?? "";

  if (errorCode === "invalid_grant") {
    if (/disabled|not fully set up|locked/i.test(description)) {
      throw new AccountDisabledError(description);
    }
    throw new InvalidCredentialsError();
  }
  if (errorCode === "invalid_client" || errorCode === "unauthorized_client") {
    throw new KeycloakConfigError(errorCode, description);
  }
  throw new KeycloakUnreachableError(
    new Error(`Keycloak ${response.status}: ${description || errorCode || "unknown"}`),
  );
}

export function ropcLogin(username: string, password: string): Promise<RawTokenResponse> {
  const body = baseBody();
  body.set("grant_type", "password");
  body.set("username", username);
  body.set("password", password);
  return exchange(body);
}

export function refreshTokens(refreshToken: string): Promise<RawTokenResponse> {
  const body = baseBody();
  body.set("grant_type", "refresh_token");
  body.set("refresh_token", refreshToken);
  return exchange(body);
}

export async function kcLogout(refreshToken: string): Promise<void> {
  const url = `${env.keycloak.url}/realms/${env.keycloak.realm}/protocol/openid-connect/logout`;
  const body = baseBody();
  body.set("refresh_token", refreshToken);
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
  } catch {
    // Keycloak unreachable — local session is cleared by the caller regardless.
  }
}
