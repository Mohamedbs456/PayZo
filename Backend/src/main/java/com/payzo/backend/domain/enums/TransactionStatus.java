package com.payzo.backend.domain.enums;

public enum TransactionStatus {
    PENDING_OTP,
    PENDING_SCORING,
    APPROVED,
    REJECTED,
    SUSPENDED_PENDING_ANALYST,
    /** Client withdrew their own pending transfer (cancelled the underlying
     *  fraud alert) — distinct from REJECTED, which is an analyst verdict
     *  of "this is fraud". Money never moved either way. */
    CANCELLED
}
