package com.payzo.backend.exception;

public class BankDeactivatedException extends RuntimeException {
    public BankDeactivatedException(String bankCode) {
        super("Bank " + bankCode + " is currently deactivated. Transfers are not allowed.");
    }
}
