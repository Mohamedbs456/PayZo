package com.payzo.backend.exception;

import com.payzo.backend.dto.response.common.ApiResponse;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.servlet.resource.NoResourceFoundException;

import java.util.List;
import java.util.stream.Collectors;

/** Maps every custom exception to the uniform {@code ApiResponse} envelope with status codes the FE can branch on without parsing {@code errorCode}. */
@RestControllerAdvice
@Slf4j
public class GlobalExceptionHandler {

    @ExceptionHandler(ResourceNotFoundException.class)
    public ResponseEntity<ApiResponse<Void>> handleNotFound(ResourceNotFoundException ex) {
        return ResponseEntity.status(404)
                .body(ApiResponse.error(ex.getMessage(), "RESOURCE_NOT_FOUND"));
    }

    @ExceptionHandler(ConflictException.class)
    public ResponseEntity<ApiResponse<Void>> handleConflict(ConflictException ex) {
        return ResponseEntity.status(409)
                .body(ApiResponse.error(ex.getMessage(), ex.getErrorCode()));
    }

    @ExceptionHandler(ValidationException.class)
    public ResponseEntity<ApiResponse<Void>> handleValidation(ValidationException ex) {
        return ResponseEntity.status(400)
                .body(ApiResponse.error(ex.getMessage(), ex.getErrorCode()));
    }

    @ExceptionHandler(UnprocessableEntityException.class)
    public ResponseEntity<ApiResponse<Void>> handleUnprocessable(UnprocessableEntityException ex) {
        return ResponseEntity.status(422)
                .body(ApiResponse.error(ex.getMessage(), ex.getErrorCode()));
    }

    /**
     * Wrong OTP code with attempts remaining (Impact 24a). The body's {@code data}
     * field carries {@code attemptsLeft} so the frontend can render the countdown
     * without re-querying the OTP state.
     */
    @ExceptionHandler(InvalidOtpException.class)
    public ResponseEntity<ApiResponse<java.util.Map<String, Integer>>> handleInvalidOtp(
            InvalidOtpException ex) {
        return ResponseEntity.status(400).body(
                ApiResponse.<java.util.Map<String, Integer>>builder()
                        .success(false)
                        .message(ex.getMessage())
                        .errorCode("INVALID_OTP")
                        .data(java.util.Map.of("attemptsLeft", ex.getAttemptsLeft()))
                        .build());
    }

    @ExceptionHandler(OtpExpiredException.class)
    public ResponseEntity<ApiResponse<Void>> handleOtpExpired(OtpExpiredException ex) {
        return ResponseEntity.status(400)
                .body(ApiResponse.error(ex.getMessage(), "OTP_EXPIRED"));
    }

    @ExceptionHandler(OtpMaxAttemptsException.class)
    public ResponseEntity<ApiResponse<Void>> handleOtpMaxAttempts(OtpMaxAttemptsException ex) {
        return ResponseEntity.status(429)
                .body(ApiResponse.error(ex.getMessage(), "OTP_MAX_ATTEMPTS"));
    }

    @ExceptionHandler(AccountBlockedException.class)
    public ResponseEntity<ApiResponse<Void>> handleBlocked(AccountBlockedException ex) {
        return ResponseEntity.status(403)
                .body(ApiResponse.error(ex.getMessage(), "USER_BLOCKED"));
    }

    @ExceptionHandler(CbsClientNotFoundException.class)
    public ResponseEntity<ApiResponse<Void>> handleCbsClientNotFound(CbsClientNotFoundException ex) {
        return ResponseEntity.status(404)
                .body(ApiResponse.error(ex.getMessage(), "CLIENT_NOT_FOUND_IN_CBS"));
    }

    @ExceptionHandler(InsufficientBalanceException.class)
    public ResponseEntity<ApiResponse<Void>> handleInsufficientBalance(InsufficientBalanceException ex) {
        return ResponseEntity.status(400)
                .body(ApiResponse.error(ex.getMessage(), "INSUFFICIENT_BALANCE"));
    }

    @ExceptionHandler(BankDeactivatedException.class)
    public ResponseEntity<ApiResponse<Void>> handleBankDeactivated(BankDeactivatedException ex) {
        return ResponseEntity.status(400)
                .body(ApiResponse.error(ex.getMessage(), "BANK_DEACTIVATED"));
    }

    @ExceptionHandler(MlServiceUnavailableException.class)
    public ResponseEntity<ApiResponse<Void>> handleMlUnavailable(MlServiceUnavailableException ex) {
        return ResponseEntity.status(503)
                .body(ApiResponse.error(ex.getMessage(), "ML_SERVICE_UNAVAILABLE"));
    }

    /**
     * Password-policy violation: 422 Unprocessable Entity. The body's {@code data}
     * field carries the per-rule violation list so the frontend can render a
     * checklist (e.g. "Must contain at least one uppercase letter").
     */
    @ExceptionHandler(PasswordPolicyException.class)
    public ResponseEntity<ApiResponse<List<String>>> handlePasswordPolicy(PasswordPolicyException ex) {
        return ResponseEntity.status(422).body(
                ApiResponse.<List<String>>builder()
                        .success(false)
                        .message(ex.getMessage())
                        .errorCode("PASSWORD_POLICY_VIOLATION")
                        .data(ex.getViolations())
                        .build());
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ApiResponse<Void>> handleValidation(MethodArgumentNotValidException ex) {
        String message = ex.getBindingResult().getFieldErrors().stream()
                .map(error -> error.getField() + ": " + error.getDefaultMessage())
                .collect(Collectors.joining(", "));
        return ResponseEntity.status(400)
                .body(ApiResponse.error(message, "VALIDATION_ERROR"));
    }

    @ExceptionHandler(AccessDeniedException.class)
    public ResponseEntity<ApiResponse<Void>> handleAccessDenied(AccessDeniedException ex) {
        return ResponseEntity.status(403)
                .body(ApiResponse.error("Access denied", "ACCESS_DENIED"));
    }

    /** Unmapped routes fall through to Spring's static {@code ResourceHttpRequestHandler}, which raises this — a 404, not a 500. */
    @ExceptionHandler(NoResourceFoundException.class)
    public ResponseEntity<ApiResponse<Void>> handleNoResourceFound(NoResourceFoundException ex) {
        return ResponseEntity.status(404)
                .body(ApiResponse.error("Resource not found", "RESOURCE_NOT_FOUND"));
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ApiResponse<Void>> handleGeneric(Exception ex) {
        log.error("Unhandled exception", ex);
        return ResponseEntity.status(500)
                .body(ApiResponse.error("An unexpected error occurred", "INTERNAL_ERROR"));
    }
}
