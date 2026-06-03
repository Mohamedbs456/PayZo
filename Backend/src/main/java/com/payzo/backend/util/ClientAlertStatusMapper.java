package com.payzo.backend.util;

import com.payzo.backend.domain.enums.AlertStatus;

/**
 * The client frontend uses a different vocabulary than the BE enum
 * ({@code PENDING_ANALYST/APPROVED} vs {@code PENDING/VALIDATED}). This
 * mapper centralises the translation so the API contract stays stable
 * even if {@link AlertStatus} is later renamed.
 */
public final class ClientAlertStatusMapper {

    private ClientAlertStatusMapper() {}

    public static String toClient(AlertStatus status) {
        if (status == null) return null;
        return switch (status) {
            case PENDING -> "PENDING_ANALYST";
            case VALIDATED -> "APPROVED";
            case REJECTED -> "REJECTED";
            case CANCELLED -> "CANCELLED";
        };
    }

    /**
     * Returns null when {@code feStatus} is null, blank, or {@code "ALL"} —
     * callers treat null as "no filter".
     */
    public static AlertStatus fromClient(String feStatus) {
        if (feStatus == null || feStatus.isBlank() || "ALL".equalsIgnoreCase(feStatus)) {
            return null;
        }
        return switch (feStatus.toUpperCase()) {
            case "PENDING_ANALYST", "PENDING" -> AlertStatus.PENDING;
            case "APPROVED", "VALIDATED" -> AlertStatus.VALIDATED;
            case "REJECTED" -> AlertStatus.REJECTED;
            case "CANCELLED" -> AlertStatus.CANCELLED;
            default -> null;
        };
    }
}
