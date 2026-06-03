import type { BoRole, JwtClaims } from "@/lib/auth/types";
import { BO_ROLES } from "@/lib/auth/types";

/**
 * Decodes a JWT *without* verifying its signature. The signature is verified
 * server-side by Spring (SecurityConfig wires `JwtIssuerAuthenticationManagerResolver`
 * with the realm's JWK set). On the frontend we only read claims to drive UI.
 */
export function decodeJwt(token: string): JwtClaims {
  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new Error("Malformed JWT — expected three dot-separated segments");
  }
  const payload = parts[1];
  // base64url → base64
  const b64 = payload.replace(/-/g, "+").replace(/_/g, "/");
  const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
  const json = atob(padded);
  // Handle UTF-8 in claims (e.g. user names with non-ASCII chars)
  const utf8 = decodeURIComponent(
    json
      .split("")
      .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
      .join(""),
  );
  return JSON.parse(utf8) as JwtClaims;
}

export function extractBoRoles(claims: JwtClaims): BoRole[] {
  const raw = claims.realm_access?.roles ?? [];
  return raw.filter((r): r is BoRole =>
    (BO_ROLES as readonly string[]).includes(r),
  );
}
