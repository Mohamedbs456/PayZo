package com.payzo.cbs.util;

import java.math.BigInteger;

/**
 * Builds 20-digit Tunisian RIB strings: {@code BB AAA NNNNNNNNNNNNN CC} where
 * BB is the 2-digit bank code, AAA the 3-digit branch, then a 13-digit account
 * body, then the 2-digit mod-97 RIB key.
 */
public final class RibGenerator {

    private static final BigInteger NINETY_SEVEN = BigInteger.valueOf(97);

    private RibGenerator() {}

    public static String generate(String numericBankCode, String branchCode, long accountSeq) {
        if (numericBankCode == null || numericBankCode.length() != 2) {
            throw new IllegalArgumentException("numericBankCode must be 2 digits");
        }
        if (branchCode == null || branchCode.length() != 3) {
            throw new IllegalArgumentException("branchCode must be 3 digits");
        }
        String first18 = numericBankCode + branchCode + String.format("%013d", accountSeq);
        int rem = new BigInteger(first18 + "00").mod(NINETY_SEVEN).intValue();
        int key = (rem == 0) ? 0 : (97 - rem);
        return first18 + String.format("%02d", key);
    }
}
