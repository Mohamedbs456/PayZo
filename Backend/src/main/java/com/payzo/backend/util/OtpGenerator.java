package com.payzo.backend.util;

import org.springframework.stereotype.Component;

import java.security.SecureRandom;

/** 6-digit OTP from {@link SecureRandom}, zero-padded so the fixed-width input on the FE always receives 6 chars. */
@Component
public class OtpGenerator {

    private static final SecureRandom SECURE_RANDOM = new SecureRandom();

    public String generate() {
        return String.format("%06d", SECURE_RANDOM.nextInt(1_000_000));
    }
}
