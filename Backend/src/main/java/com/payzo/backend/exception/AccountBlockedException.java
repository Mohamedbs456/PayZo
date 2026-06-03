package com.payzo.backend.exception;

public class AccountBlockedException extends RuntimeException {
    public AccountBlockedException() {
        super("Your account has been suspended. Contact support.");
    }

    public AccountBlockedException(String message) {
        super(message);
    }
}
