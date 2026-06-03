package com.payzo.backend.util;

import java.math.BigInteger;

/**
 * Mints valid 20-digit Tunisian RIBs for demo / fixture seeding.
 * <p>
 * RIB layout: {@code BB AAA NNNNNNNNNNNNN CC} = 2-digit bank numeric code +
 * 3-digit branch + 13-digit account body + 2-digit mod-97 check. The whole
 * string read as a single integer must be divisible by 97 — see
 * {@link RibValidator#isValid(String)}.
 * <p>
 * Production code does not mint RIBs (real RIBs come from CBS); this lives in
 * {@code util} so {@code DemoSeedService} and any future test fixture can
 * reuse the same algorithm without dragging the seed service into the
 * production classpath.
 */
public final class RibMinter {

    private static final BigInteger NINETY_SEVEN = BigInteger.valueOf(97);
    private static final BigInteger HUNDRED = BigInteger.valueOf(100);

    private RibMinter() {}

    /**
     * @param bankNumericCode 2-digit Tunisian bank numeric (e.g. {@code "08"} for BIAT).
     * @param branchCode      3-digit branch (use {@code "001"} for a single-branch fiction).
     * @param accountSeq      monotonically-increasing account sequence — gets zero-padded to 13 digits.
     * @return a 20-digit RIB that satisfies {@link RibValidator#isValid(String)}.
     */
    public static String mint(String bankNumericCode, String branchCode, long accountSeq) {
        if (bankNumericCode == null || bankNumericCode.length() != 2 || !bankNumericCode.matches("\\d{2}")) {
            throw new IllegalArgumentException("bankNumericCode must be exactly 2 digits");
        }
        if (branchCode == null || branchCode.length() != 3 || !branchCode.matches("\\d{3}")) {
            throw new IllegalArgumentException("branchCode must be exactly 3 digits");
        }
        if (accountSeq < 0 || accountSeq > 9_999_999_999_999L) {
            throw new IllegalArgumentException("accountSeq does not fit in 13 digits");
        }
        String body = String.format("%013d", accountSeq);
        String first18 = bankNumericCode + branchCode + body;
        // CC ≡ −D·100 (mod 97) ≡ (97 − (D·100 mod 97)) mod 97
        BigInteger d = new BigInteger(first18);
        int r = d.multiply(HUNDRED).mod(NINETY_SEVEN).intValueExact();
        int check = (97 - r) % 97;   // % 97 collapses the r=0 → 97 → 0 corner case
        return first18 + String.format("%02d", check);
    }
}
