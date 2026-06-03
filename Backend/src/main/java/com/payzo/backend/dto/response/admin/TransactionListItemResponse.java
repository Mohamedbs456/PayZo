package com.payzo.backend.dto.response.admin;

import com.payzo.backend.domain.enums.RiskLevel;
import com.payzo.backend.domain.enums.TransactionStatus;
import lombok.Builder;
import lombok.Data;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * Lightweight row for the transactions list (BACKEND_IMPACTS.md Impact 9a).
 * Optimised for table rendering — no nested objects, no expensive lookups.
 *
 * The {@code party} field carries the *other side*'s display name from the
 * backoffice's perspective: the receiver's full name (sender name is shown
 * separately via the client column).
 */
@Data
@Builder
public class TransactionListItemResponse {

    private UUID id;
    private String reference;

    // Sender
    private String clientCin;
    private String clientName;
    /** Sender bank code — needed by the dashboard's per-source-bank charts
     *  (e.g. 1D hourly bucketing in MoneyPerBankCard) so they don't have to
     *  hit /transactions/{id} per row. */
    private String sourceBankCode;

    // Receiver
    private String party;
    private String destAccountNumber;
    private String destBankCode;

    private BigDecimal amount;
    private TransactionStatus status;
    private RiskLevel riskLevel;
    private OffsetDateTime createdAt;
}
