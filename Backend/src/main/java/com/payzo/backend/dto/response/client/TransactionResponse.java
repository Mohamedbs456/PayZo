package com.payzo.backend.dto.response.client;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.payzo.backend.domain.enums.RiskLevel;
import com.payzo.backend.domain.enums.TransactionStatus;
import lombok.Data;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.UUID;

@Data
public class TransactionResponse {

    private UUID id;
    private String reference;
    private String sourceAccountNumber;
    private String destinationAccountNumber;
    private String sourceBankCode;
    private String destBankCode;
    private BigDecimal amount;
    /**
     * The free-text reason the user entered when initiating the transfer.
     * Field name on the entity is {@code motif} (carried over from the
     * old DTO shape); the FE reads it as {@code description}, so we
     * rename on the wire via {@link JsonProperty} to keep both happy
     * without forcing every internal call-site to follow.
     */
    @JsonProperty("description")
    private String motif;
    private TransactionStatus status;
    private BigDecimal riskScore;
    private RiskLevel riskLevel;
    private OffsetDateTime createdAt;
    private OffsetDateTime executedAt;
    /**
     * Canonical "when did this transaction happen" timestamp the FE
     * uses for row stamps, date-grouping, and the "Today / Yesterday"
     * subtitle. We prefer {@code executedAt} (when the money actually
     * moved) and fall back to {@code createdAt} (when the row was
     * inserted) — that way pre-PayZo CBS rows and pending PayZo rows
     * both render a real date instead of "Invalid Date".
     */
    private OffsetDateTime timestamp;
    /**
     * Set when the sender confirmed the transfer OTP (pulled from
     * {@code Transaction.otpConfirmedAt}). Surfaced in the expanded-row
     * detail panel; null for CBS-only rows that didn't go through OTP.
     */
    private OffsetDateTime otpConfirmedAt;

    /**
     * "PAYZO" if the transfer was initiated through the PayZo app
     * (P2P or internal), "EXTERNAL" if it pre-existed in the bank's
     * core system or originated outside PayZo. Discriminator is
     * {@code CbsTransaction.referenceByPayZo} (null ⇒ EXTERNAL).
     * Always "PAYZO" for rows from {@code payzo_db.transactions}.
     */
    private String origin;

    /* ─── Caller-relative direction & counterpart info ─────────────────────
     * Computed server-side per request because direction depends on WHO
     * is asking. The merge endpoint pulls a transfer for both the sender
     * and receiver; sender sees DEBIT, receiver sees CREDIT for the same
     * underlying row. The FE renders the row's color, sign, and arrow
     * direction off these fields — without them every row defaults to
     * SENT/red.
     */

    /** "DEBIT" (money out, you sent) | "CREDIT" (money in, you received). */
    private String type;

    /** Full name of the other party. Null for CBS rows we couldn't resolve. */
    private String counterpartName;

    /** Other party's @username. Only populated for PayZo-originated P2P transfers. */
    private String counterpartUsername;

    /** Other party's CBS account number. */
    private String counterpartAccount;

    /**
     * Other party's profile picture URL (server-relative, e.g.
     * {@code /api/v1/uploads/profile-pictures/{id}.jpg}). Populated for
     * PayZo P2P transfers when we can resolve the counterpart's
     * {@code Client} row; null otherwise (CBS-only legacy rows, or
     * recipients we couldn't link to a PayZo user).
     */
    private String counterpartProfilePictureUrl;

    /** True when both source and destination accounts belong to the requester. */
    private Boolean internal;

    /** "BIAT ••8421"-style label for the requester's side of the transfer. */
    private String sourceMaskedAccount;

    /** "BIAT ••4521"-style label for the counterpart's side. */
    private String destMaskedAccount;
}
