package com.payzo.backend.util;

import java.text.Normalizer;

/**
 * Accent-insensitive, case-insensitive, whitespace-tolerant name comparison.
 * Used for the recipient name verification on transfer ("Confirmation of
 * Payee"-style check) where the sender types a name and the backend matches
 * against CBS-stored data.
 */
public final class NameMatcher {

    private NameMatcher() {}

    public static boolean matches(String typed, String stored) {
        return normalize(typed).equals(normalize(stored));
    }

    public static String normalize(String s) {
        if (s == null) return "";
        return Normalizer.normalize(s, Normalizer.Form.NFD)
                .replaceAll("\\p{M}", "")
                .toLowerCase()
                .trim()
                .replaceAll("\\s+", " ");
    }
}
