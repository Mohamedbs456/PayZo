package com.payzo.backend.dto.response.analyst;

import com.payzo.backend.domain.enums.AlertStatus;
import com.payzo.backend.domain.enums.RiskLevel;
import com.payzo.backend.domain.enums.Role;
import lombok.Data;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

/**
 * Per BACKEND_IMPACTS.md Impact 8d. The shape that the analyst dashboard and the
 * backoffice fraud-alerts list both consume. Keeping a single response shape (no
 * separate list-vs-detail variant) is fine because the alert payload is small and
 * both views need the same fields.
 */
@Data
public class FraudAlertResponse {

    private UUID id;

    // ── Transaction snapshot ───────────────────────────────────────────────────
    private UUID transactionId;
    private String transactionReference;
    private BigDecimal amount;
    private BigDecimal riskScore;
    private RiskLevel riskLevel;
    private String sourceBankCode;
    private String destBankCode;

    // ── Decision state ─────────────────────────────────────────────────────────
    private AlertStatus status;

    // ── Sender (the client who initiated the transfer) ─────────────────────────
    private String clientCin;
    private String clientName;

    // ── Explanations ───────────────────────────────────────────────────────────
    /** ML-generated reasons captured at suspension time. May be empty. */
    private List<String> mlReasons;
    /** Free-text decision note typed by the analyst. Null while the alert is pending. */
    private String analystComment;

    // ── Analyst attribution ────────────────────────────────────────────────────
    private UUID analystId;
    private String analystName;
    private Role analystRole;

    // ── Outcome ────────────────────────────────────────────────────────────────
    /** Receiver-side trust-score delta applied by the decision (signed). Null while pending. */
    private Integer trustDelta;
    private OffsetDateTime decidedAt;
    private OffsetDateTime createdAt;
}
