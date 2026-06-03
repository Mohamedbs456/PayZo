package com.payzo.backend.exception;

import lombok.Getter;

/**
 * 400-class validation failure with a stable machine-readable error code.
 * Used by RIB validation, recipient name mismatch, and other request-level
 * rejections that aren't a state conflict (which would be a 409
 * {@link ConflictException}).
 */
@Getter
public class ValidationException extends RuntimeException {

    private final String errorCode;

    public ValidationException(String message, String errorCode) {
        super(message);
        this.errorCode = errorCode;
    }
}
