package com.payzo.cbs.exception;

public class CbsClientNotFoundException extends RuntimeException {

    public CbsClientNotFoundException(String identifier) {
        super("CBS client not found: " + identifier);
    }
}
