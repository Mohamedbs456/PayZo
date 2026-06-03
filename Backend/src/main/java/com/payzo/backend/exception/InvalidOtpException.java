package com.payzo.backend.exception;

import lombok.Getter;

/**
 * Wrong OTP code entered, but the user has at least one attempt remaining.
 * The {@link #attemptsLeft} field is surfaced in the 400 response body so the
 * frontend can render "X attempts remaining" without re-querying (Impact 24a).
 *
 * Once attempts are exhausted, {@link OtpMaxAttemptsException} is thrown instead.
 */
@Getter
public class InvalidOtpException extends RuntimeException {

    /** Number of attempts the user has left before the OTP is locked. May be 0. */
    private final int attemptsLeft;

    public InvalidOtpException(int attemptsLeft) {
        super("Invalid OTP code");
        this.attemptsLeft = Math.max(0, attemptsLeft);
    }

    public InvalidOtpException(String message, int attemptsLeft) {
        super(message);
        this.attemptsLeft = Math.max(0, attemptsLeft);
    }
}
