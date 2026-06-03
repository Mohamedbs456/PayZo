package com.payzo.backend.dto.response.client;

import com.payzo.backend.domain.enums.RiskLevel;
import lombok.Data;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

/**
 * Client-facing fraud alert payload. The {@code status} string uses the
 * frontend taxonomy ({@code PENDING_ANALYST | APPROVED | REJECTED |
 * CANCELLED}) — see {@code util/ClientAlertStatusMapper}. The internal
 * {@code AlertStatus} enum is intentionally not exposed here; the
 * mapping lives in one place to keep the wire contract stable across
 * future enum renames.
 */
@Data
public class AlertResponse {

    private UUID id;
    private UUID transactionId;
    private String transactionReference;

    private String status;

    private BigDecimal amount;
    private RiskLevel riskLevel;
    private String sourceBankCode;
    private String destBankCode;

    private String counterpartName;

    private List<String> mlReasons;

    private String decisionReason;
    private Integer trustDelta;
    private OffsetDateTime decidedAt;
    private OffsetDateTime createdAt;
}
