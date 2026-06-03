package com.payzo.backend.util;

import com.payzo.backend.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.text.Normalizer;
import java.util.Locale;
import java.util.regex.Pattern;

/**
 * Generates a unique username from a user's first/last name. Tries `firstname.lastname`
 * first; on collision, appends a numeric suffix until unique.
 *
 * Usernames are lowercased ASCII only — accented Tunisian/French characters are stripped
 * (e.g. "Béatrice Boualég" → "beatrice.boualeg") so they can be typed on any keyboard
 * and used as Keycloak usernames without escaping issues.
 */
@Component
@RequiredArgsConstructor
public class UsernameGenerator {

    private static final Pattern NON_ASCII_LETTERS = Pattern.compile("[^a-z0-9]");
    private static final Pattern DIACRITICS = Pattern.compile("\\p{InCombiningDiacriticalMarks}+");

    private final UserRepository userRepository;

    public String generateFor(String firstName, String lastName) {
        String base = sanitize(firstName) + "." + sanitize(lastName);
        if (base.equals(".") || base.startsWith(".") || base.endsWith(".")) {
            base = "user";
        }

        if (!userRepository.existsByUsername(base)) {
            return base;
        }

        int suffix = 2;
        while (true) {
            String candidate = base + suffix;
            if (!userRepository.existsByUsername(candidate)) {
                return candidate;
            }
            suffix++;
        }
    }

    private static String sanitize(String input) {
        if (input == null) return "";
        String normalized = Normalizer.normalize(input, Normalizer.Form.NFD);
        String stripped = DIACRITICS.matcher(normalized).replaceAll("");
        String lowered = stripped.toLowerCase(Locale.ROOT);
        return NON_ASCII_LETTERS.matcher(lowered).replaceAll("");
    }
}
