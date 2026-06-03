package com.payzo.backend.exception;

public class InsufficientBalanceException extends RuntimeException {
    public InsufficientBalanceException() {
        super("Insufficient balance to complete this transfer.");
    }
}
