package com.payzo.backend.exception;

public class OtpExpiredException extends RuntimeException {
    public OtpExpiredException() {
        super("OTP has expired. Please request a new one.");
    }

    public OtpExpiredException(String message) {
        super(message);
    }
}
