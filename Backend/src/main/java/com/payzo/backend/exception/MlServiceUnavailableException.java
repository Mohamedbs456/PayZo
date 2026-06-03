package com.payzo.backend.exception;

public class MlServiceUnavailableException extends RuntimeException {
    public MlServiceUnavailableException() {
        super("ML service is unavailable. Stub fallback was applied.");
    }
}
