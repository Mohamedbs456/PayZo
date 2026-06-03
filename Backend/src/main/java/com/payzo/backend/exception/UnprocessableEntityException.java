package com.payzo.backend.exception;

import lombok.Getter;

/**
 * 422 Unprocessable Entity — the request is syntactically valid (JSON parsed,
 * required fields present) but the value violates a business / format rule
 * the server enforces. Distinct from {@link ValidationException} (which is
 * 400 / "the request itself is malformed") and {@link ConflictException}
 * (which is 409 / "valid request, but it conflicts with persisted state").
 *
 * <p>Used by the editable-username endpoint when the new value doesn't match
 * {@link com.payzo.backend.util.UsernameValidator#USERNAME_REGEX}.
 */
@Getter
public class UnprocessableEntityException extends RuntimeException {

    private final String errorCode;

    public UnprocessableEntityException(String message, String errorCode) {
        super(message);
        this.errorCode = errorCode;
    }
}
