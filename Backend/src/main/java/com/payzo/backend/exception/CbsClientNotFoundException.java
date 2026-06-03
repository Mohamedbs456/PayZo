package com.payzo.backend.exception;

public class CbsClientNotFoundException extends RuntimeException {
    public CbsClientNotFoundException(String cin) {
        super("CIN not found in CBS: " + cin);
    }
}
