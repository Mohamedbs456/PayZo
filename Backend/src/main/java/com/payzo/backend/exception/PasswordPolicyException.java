package com.payzo.backend.exception;

import lombok.Getter;

import java.util.List;

/**
 * Thrown when a candidate password fails the canonical policy (DECISIONS.md D46 /
 * BACKEND_IMPACTS.md Impact 21b). Mapped by GlobalExceptionHandler to HTTP 422
 * (Unprocessable Entity) — the request was syntactically valid but its content
 * violated a documented business rule.
 *
 * The {@link #violations} list lets the frontend render a per-rule checklist
 * (e.g. "Must contain at least one digit", "Must be at least 8 characters").
 */
@Getter
public class PasswordPolicyException extends RuntimeException {

    private final List<String> violations;

    public PasswordPolicyException(List<String> violations) {
        super("Password does not meet the security policy");
        this.violations = List.copyOf(violations);
    }
}
