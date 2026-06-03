package com.payzo.backend.util;

import java.math.BigInteger;

/**
 * Validates and parses 20-digit Tunisian RIBs of the form
 * {@code BB AAA NNNNNNNNNNNNN CC} (2-digit bank code, 3-digit branch, 13-digit
 * account body, 2-digit mod-97 check). Whitespace anywhere in the input is
 * tolerated; everything else must be numeric.
 */
public final class RibValidator {

    public static final int RIB_LENGTH = 20;
    private static final BigInteger NINETY_SEVEN = BigInteger.valueOf(97);

    private RibValidator() {}

    public static boolean isValid(String rib) {
        if (rib == null) return false;
        String s = normalize(rib);
        if (s.length() != RIB_LENGTH || !s.matches("\\d{20}")) return false;
        return new BigInteger(s).mod(NINETY_SEVEN).signum() == 0;
    }

    public static String normalize(String rib) {
        return rib == null ? null : rib.replaceAll("\\s+", "");
    }

    public static String extractNumericBankCode(String rib) {
        return normalize(rib).substring(0, 2);
    }

    public static String extractBranchCode(String rib) {
        return normalize(rib).substring(2, 5);
    }

    /** Returns the RIB with the canonical {@code BB AAA NNNNNNNNNNNNN CC} spacing for display. */
    public static String formatDisplay(String rib) {
        String s = normalize(rib);
        return s.substring(0, 2) + " " + s.substring(2, 5) + " "
                + s.substring(5, 18) + " " + s.substring(18, 20);
    }
}
