package com.payzo.cbs.exception;

public class InsufficientFundsException extends RuntimeException {

    public InsufficientFundsException(String accountNumber) {
        super("Insufficient funds in account: " + accountNumber);
    }
}
