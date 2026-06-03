// Client-side mirror of util/UsernameValidator.java — kept byte-for-byte
// identical to the backend (and to Client-Web-App/src/features/me/usernameRules.ts).
// The backend is the authority; this only keeps the Save button disabled while
// the draft is unsaveable. Change all three together.

export const USERNAME_REGEX = /^[a-z][a-z0-9._]{2,29}$/;

export const RESERVED_USERNAMES: ReadonlySet<string> = new Set([
  "admin",
  "payzo",
  "support",
  "system",
  "root",
  "official",
  "analyst",
  "superadmin",
  "backoffice",
  "anonymous",
  "null",
  "undefined",
  "me",
  "self",
]);

export function normalizeUsername(raw: string): string {
  let v = raw.trim();
  if (v.startsWith("@")) v = v.slice(1);
  return v.toLowerCase();
}

export function validateUsername(raw: string): { ok: true } | { ok: false; reason: string } {
  const value = normalizeUsername(raw);
  if (value.length === 0) return { ok: false, reason: "Username can't be empty." };
  if (value.length < 3) return { ok: false, reason: "Username must be at least 3 characters." };
  if (value.length > 30) return { ok: false, reason: "Username must be 30 characters or fewer." };
  if (!/^[a-z]/.test(value)) return { ok: false, reason: "Username must start with a letter." };
  if (!USERNAME_REGEX.test(value)) {
    return { ok: false, reason: "Only lowercase letters, digits, dots, and underscores are allowed." };
  }
  if (RESERVED_USERNAMES.has(value)) return { ok: false, reason: "This username is reserved." };
  return { ok: true };
}
