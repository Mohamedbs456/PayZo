package com.payzo.backend.util;

/**
 * Masks email and phone strings into the formats the channel-chooser UI
 * renders. Centralised so signup, login, and forgot-password use the same
 * shapes:
 * <ul>
 *   <li>Email {@code ahmed.benali@gmail.com} → {@code ah***@gmail.com}
 *       (first 2 chars + {@code ***} + {@code @} + domain).</li>
 *   <li>Phone {@code +21671234567} → {@code +216 71 2** ***} (country code
 *       + first two digits, rest masked with {@code *} preserving width).</li>
 * </ul>
 *
 * Null/blank inputs return {@code null} — callers decide whether that
 * channel is offerable on the picker.
 *
 * <p><b>Encoding note:</b> the previous version used the Unicode bullet
 * {@code U+2022} ({@code •}) which the Java compiler on Windows reads as
 * Windows-1252 by default and decodes as the three-byte sequence
 * {@code â€¢}, producing visibly broken JSON ({@code "hiâ€¢..."}).
 * Plain ASCII asterisks render identically across every browser and
 * sidestep the source-encoding pitfall entirely.
 */
public final class OtpDestinationMasker {

    private OtpDestinationMasker() {}

    public static String maskEmail(String email) {
        if (email == null || email.isBlank()) return null;
        int at = email.indexOf('@');
        if (at <= 0 || at == email.length() - 1) return null;
        String local = email.substring(0, at);
        String domain = email.substring(at + 1);
        String prefix = local.length() <= 2 ? local : local.substring(0, 2);
        return prefix + "***@" + domain;
    }

    /**
     * Tunisian phone numbers come from CBS in {@code +216XXXXXXXX} form.
     * Mask shape (fixed, not digit-preserving) so the picker copy reads
     * predictably regardless of how long the underlying number is:
     * <pre>+216 71 2** ***</pre>
     * country code + first two local digits + one visible "first-of-tail"
     * digit + {@code ** ***}. Falls back to {@code null} for inputs we
     * can't slice that way.
     */
    public static String maskPhone(String phone) {
        if (phone == null || phone.isBlank()) return null;
        String digits = phone.replaceAll("[^+\\d]", "");
        boolean plus = digits.startsWith("+");
        String body = plus ? digits.substring(1) : digits;
        // Need at least country (3) + first-two-local (2) + one tail digit.
        if (body.length() < 6) return null;
        String country = body.substring(0, 3);
        String firstTwoLocal = body.substring(3, 5);
        String tailHead = body.substring(5, 6);
        return (plus ? "+" : "") + country + " " + firstTwoLocal
                + " " + tailHead + "** ***";
    }
}
