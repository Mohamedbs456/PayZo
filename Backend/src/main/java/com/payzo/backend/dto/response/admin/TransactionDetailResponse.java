package com.payzo.backend.dto.response.admin;

import com.payzo.backend.domain.enums.ActiveLayer;
import com.payzo.backend.domain.enums.RiskLevel;
import com.payzo.backend.domain.enums.TransactionStatus;
import lombok.Builder;
import lombok.Data;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

/**
 * Full detail payload for the transaction inline-expansion drawer (Impact 9b /
 * D40). Composed of three nested groups:
 *
 *  - {@code from} / {@code to}  — party identity + account / bank info
 *  - {@code timeline}           — phase timestamps (created, OTP confirmed, decided, settled)
 *  - {@code ml}                 — ML decision context (score, reasons, active layer)
 */
@Data
@Builder
public class TransactionDetailResponse {

    private UUID id;
    private String reference;
    private TransactionStatus status;
    private BigDecimal amount;
    private String motif;

    private Party from;
    private Party to;
    private Timeline timeline;
    private Ml ml;

    @Data
    @Builder
    public static class Party {
        /** Full name; for {@code from} this is the PayZo client; for {@code to} it may be CBS-only. */
        private String name;
        /** PayZo username; null when the party is not a PayZo client (CBS-only receiver). */
        private String username;
        private String accountNumber;
        private String bankCode;
    }

    @Data
    @Builder
    public static class Timeline {
        private OffsetDateTime createdAt;
        /** Set when {@code confirmTransfer} validated the OTP and moved to PENDING_SCORING. */
        private OffsetDateTime otpConfirmedAt;
        /** For HIGH/MED suspended transfers: when the analyst approved or rejected. */
        private OffsetDateTime decidedAt;
        /** When the CBS executed the debit/credit (APPROVED state). */
        private OffsetDateTime settledAt;
    }

    @Data
    @Builder
    public static class Ml {
        private BigDecimal score;
        private RiskLevel level;
        /** Layer that produced the score at decision time. */
        private ActiveLayer activeLayer;
        /** Reasons preserved on the FraudAlert (empty when no alert was raised). */
        private List<String> reasons;
        /** Trust score delta the alert decision applied. Null when no alert was raised. */
        private Integer trustDelta;
    }
}
