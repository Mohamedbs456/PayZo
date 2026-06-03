package com.payzo.backend.util;

import com.payzo.backend.exception.PasswordPolicyException;

import java.util.ArrayList;
import java.util.List;

/**
 * Single source of truth for the canonical password policy (DECISIONS.md D46).
 *
 *  - Min length 8, max length 64.
 *  - At least one uppercase letter (A–Z).
 *  - At least one digit (0–9).
 *  - At least one special character from the allowed set:  {@value #ALLOWED_SPECIALS}
 *  - No other characters allowed (rejects e.g. emoji, control chars, exotic symbols).
 *
 * Server-side enforcement matches what the client app validates so a request that
 * passes client-side checks won't be rejected at the backend with a confusing 400.
 */
public final class PasswordPolicy {

    // Matches the realm-level passwordPolicy on Keycloak (length(12) +
    // uppercase + lowercase + digit + special). Keep these in sync — if
    // they drift, the app accepts a password that Keycloak then rejects
    // with HTTP 400 on the password reset.
    public static final int MIN_LENGTH = 12;
    public static final int MAX_LENGTH = 64;
    public static final String ALLOWED_SPECIALS = "!@#$%^&*()_+-=[]{}<>?";

    private PasswordPolicy() {}

    /**
     * Throws {@link PasswordPolicyException} if {@code password} violates any rule.
     * Returns silently when the password is acceptable.
     */
    public static void enforce(String password) {
        List<String> violations = check(password);
        if (!violations.isEmpty()) {
            throw new PasswordPolicyException(violations);
        }
    }

    /** Same checks as {@link #enforce} but returns the violation list instead of throwing. */
    public static List<String> check(String password) {
        List<String> violations = new ArrayList<>();
        if (password == null) {
            violations.add("Password is required");
            return violations;
        }
        if (password.length() < MIN_LENGTH) {
            violations.add("Must be at least " + MIN_LENGTH + " characters");
        }
        if (password.length() > MAX_LENGTH) {
            violations.add("Must be at most " + MAX_LENGTH + " characters");
        }

        boolean hasUpper = false;
        boolean hasDigit = false;
        boolean hasSpecial = false;
        boolean hasIllegal = false;

        for (char c : password.toCharArray()) {
            if (Character.isUpperCase(c)) {
                hasUpper = true;
            } else if (Character.isLowerCase(c)) {
                /* allowed but no flag — lowercase is permitted, not required */
            } else if (Character.isDigit(c)) {
                hasDigit = true;
            } else if (ALLOWED_SPECIALS.indexOf(c) >= 0) {
                hasSpecial = true;
            } else {
                hasIllegal = true;
            }
        }

        if (!hasUpper)   violations.add("Must contain at least one uppercase letter (A–Z)");
        if (!hasDigit)   violations.add("Must contain at least one digit (0–9)");
        if (!hasSpecial) violations.add("Must contain at least one of " + ALLOWED_SPECIALS);
        if (hasIllegal)  violations.add("Contains characters outside the allowed set");

        return violations;
    }
}
