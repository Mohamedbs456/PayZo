package com.payzo.backend.util;

import org.springframework.stereotype.Component;

import java.security.SecureRandom;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;

/** Public transaction reference in the form {@code TRX-YYYYMMDD-XXXXX} with a 5-char alphanumeric tail. */
@Component
public class TransactionReferenceGenerator {

    private static final SecureRandom RANDOM = new SecureRandom();
    private static final String CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    private static final DateTimeFormatter DATE_FMT = DateTimeFormatter.ofPattern("yyyyMMdd");

    public String generate() {
        StringBuilder suffix = new StringBuilder(5);
        for (int i = 0; i < 5; i++) {
            suffix.append(CHARS.charAt(RANDOM.nextInt(CHARS.length())));
        }
        return "TRX-" + LocalDate.now().format(DATE_FMT) + "-" + suffix;
    }
}
