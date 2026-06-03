package com.payzo.backend.util;

import org.springframework.stereotype.Component;

import java.security.SecureRandom;

/** 12-char temp password with one of each char class (upper, lower, digit, special), Fisher-Yates shuffled to match {@code PasswordPolicy}. */
@Component
public class PasswordGenerator {

    private static final SecureRandom RANDOM = new SecureRandom();
    private static final String UPPER = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    private static final String LOWER = "abcdefghijklmnopqrstuvwxyz";
    private static final String DIGITS = "0123456789";
    private static final String SPECIAL = "+-*/@#!%&";
    private static final String ALL = UPPER + LOWER + DIGITS + SPECIAL;

    public String generate() {
        char[] password = new char[12];

        password[0] = UPPER.charAt(RANDOM.nextInt(UPPER.length()));
        password[1] = LOWER.charAt(RANDOM.nextInt(LOWER.length()));
        password[2] = DIGITS.charAt(RANDOM.nextInt(DIGITS.length()));
        password[3] = SPECIAL.charAt(RANDOM.nextInt(SPECIAL.length()));

        for (int i = 4; i < 12; i++) {
            password[i] = ALL.charAt(RANDOM.nextInt(ALL.length()));
        }

        for (int i = password.length - 1; i > 0; i--) {
            int j = RANDOM.nextInt(i + 1);
            char tmp = password[i];
            password[i] = password[j];
            password[j] = tmp;
        }

        return new String(password);
    }
}
