import { CLIENT_ROLES, type ClientRole, type JwtClaims } from "@/lib/auth/types";

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

// Pure-JS base64 -> binary string. Hermes doesn't reliably expose a global
// atob, so decoding the token can't depend on one.
function base64ToBinary(input: string): string {
  const str = input.replace(/=+$/, "");
  let output = "";
  let buffer = 0;
  let bits = 0;
  for (let i = 0; i < str.length; i++) {
    const idx = B64.indexOf(str.charAt(i));
    if (idx === -1) continue;
    buffer = (buffer << 6) | idx;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      output += String.fromCharCode((buffer >> bits) & 0xff);
    }
  }
  return output;
}

// Decodes a JWT without verifying the signature — the backend verifies it
// against the realm JWK set. We only read claims to drive the UI.
export function decodeJwt(token: string): JwtClaims {
  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new Error("Malformed JWT — expected three dot-separated segments");
  }
  const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
  const json = base64ToBinary(b64);
  const utf8 = decodeURIComponent(
    json
      .split("")
      .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
      .join(""),
  );
  return JSON.parse(utf8) as JwtClaims;
}

export function extractClientRoles(claims: JwtClaims): ClientRole[] {
  const raw = claims.realm_access?.roles ?? [];
  return raw.filter((r): r is ClientRole => (CLIENT_ROLES as readonly string[]).includes(r));
}
