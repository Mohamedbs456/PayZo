/**
 * Client-side mirror of the backend's username rules — kept byte-for-byte
 * identical to `Backend/src/main/java/com/payzo/backend/util/UsernameValidator.java`.
 *
 * The backend is the authority (it's the one that throws 422 / 409), but
 * we duplicate the rules here so the Save button can stay disabled while
 * the draft is unsaveable — no round-trip needed to tell the user the
 * shape is wrong. If the regex or reserved list changes, change both.
 */

/** 3–30 chars, lowercase letters + digits + `.` + `_`, must start with a letter. */
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

/** Strip leading `@`, trim, lowercase. */
export function normalizeUsername(raw: string): string {
  let v = raw.trim();
  if (v.startsWith("@")) v = v.slice(1);
  return v.toLowerCase();
}

/**
 * Client-side validation result. The backend re-runs everything, so this is
 * a UX aid only — never relied on for security. Returns the first applicable
 * error so the inline message reads naturally ("min 3 chars" beats a generic
 * "must match regex").
 */
export function validateUsername(raw: string): { ok: true } | { ok: false; reason: string } {
  const value = normalizeUsername(raw);
  if (value.length === 0) return { ok: false, reason: "Username can't be empty." };
  if (value.length < 3) return { ok: false, reason: "Username must be at least 3 characters." };
  if (value.length > 30) return { ok: false, reason: "Username must be 30 characters or fewer." };
  if (!/^[a-z]/.test(value))
    return { ok: false, reason: "Username must start with a letter." };
  if (!USERNAME_REGEX.test(value))
    return {
      ok: false,
      reason:
        "Only lowercase letters, digits, dots, and underscores are allowed.",
    };
  if (RESERVED_USERNAMES.has(value))
    return { ok: false, reason: "This username is reserved." };
  return { ok: true };
}
