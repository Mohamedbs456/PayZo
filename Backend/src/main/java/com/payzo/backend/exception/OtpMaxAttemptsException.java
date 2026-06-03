package com.payzo.backend.exception;

public class OtpMaxAttemptsException extends RuntimeException {
    public OtpMaxAttemptsException() {
        super("Maximum OTP attempts exceeded. Please request a new OTP.");
    }

    public OtpMaxAttemptsException(String message) {
        super(message);
    }
}
