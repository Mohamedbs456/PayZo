package com.payzo.backend.domain.enums;

public enum UserNotificationType {

    // Client notifications
    TRX_RECEIVED,
    TRX_APPROVED,
    TRX_REJECTED,
    BANK_DEACTIVATED,
    BANK_REACTIVATED,
    REGISTRATION_APPROVED,
    REGISTRATION_REJECTED,

    // Admin notifications
    NEW_PENDING_REGISTRATION,
    CLIENT_FIRST_LOGIN,

    // Analyst notifications
    FRAUD_ALERT_PENDING,
    ML_PRIMARY_DOWN,
    ML_PRIMARY_UP,
    ML_BACKUP_DOWN,
    ML_THRESHOLDS_UPDATED,

    // SuperAdmin notifications
    ANALYST_THRESHOLD_REPORT,
    ML_BACKUP_UP,
    ADMIN_CREATED,
    ADMIN_DELETED,
    ANALYST_CREATED,
    ANALYST_DELETED,
    BANK_ADDED,
    BANK_REMOVED_FROM_CBS,
    CLIENT_BLOCKED,
    CLIENT_UNBLOCKED,

    // Shared (Admin + Analyst)
    COLLEAGUE_JOINED,
    COLLEAGUE_LEFT
}
