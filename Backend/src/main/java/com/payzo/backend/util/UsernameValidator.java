package com.payzo.backend.util;

import java.util.Locale;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * Format + reserved-name rules for the editable client {@code @username}.
 *
 * The regex {@link #USERNAME_REGEX} is the single source of truth: the frontend
 * mirrors it byte-for-byte (`Client-Web-App/src/features/me/usernameRules.ts`).
 * If you tighten/relax it here, change both sides — the @username path on the
 * send-money flow assumes a username that lands in the DB is already in the
 * allowed shape.
 *
 * <p>Storage is lowercase; uniqueness is enforced case-insensitively
 * ({@link com.payzo.backend.repository.UserRepository#existsByUsernameIgnoreCase(String)}).
 */
public final class UsernameValidator {

    /**
     * 3–30 chars, lowercase Latin letters + digits + `.` + `_`, must start
     * with a letter. The non-letter starting characters are excluded so a
     * recipient picker that strips a leading `@` can't be confused by a
     * username that happens to start with one (or with a digit, which
     * could collide with accidental amount-input bleed).
     */
    public static final Pattern USERNAME_REGEX =
            Pattern.compile("^[a-z][a-z0-9._]{2,29}$");

    /**
     * Lowercase reserved names — protect impersonation of staff handles,
     * platform-name handles, and a few language/runtime sentinels that
     * commonly slip through wire encoders.
     */
    public static final Set<String> RESERVED = Set.of(
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
            "self"
    );

    private UsernameValidator() { /* no instances */ }

    /**
     * Strip leading {@code @} and lowercase. Always pass user input through
     * this before checking format / reserved / uniqueness so the same string
     * the user typed is the string stored.
     */
    public static String normalize(String raw) {
        if (raw == null) return "";
        String trimmed = raw.trim();
        if (trimmed.startsWith("@")) trimmed = trimmed.substring(1);
        return trimmed.toLowerCase(Locale.ROOT);
    }

    public static boolean matchesFormat(String normalized) {
        return normalized != null && USERNAME_REGEX.matcher(normalized).matches();
    }

    public static boolean isReserved(String normalized) {
        return normalized != null && RESERVED.contains(normalized);
    }
}
