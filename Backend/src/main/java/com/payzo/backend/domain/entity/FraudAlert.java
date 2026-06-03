package com.payzo.backend.domain.entity;

import com.payzo.backend.domain.enums.AlertStatus;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

/**
 * One alert per suspicious transaction. Per DECISIONS.md D39 / BACKEND_IMPACTS.md
 * Impact 8 the alert now also carries:
 *  - {@code mlReasons}: human-readable explanations from the ML scorer (so analysts
 *    can see *why* the model flagged this transfer without re-running the model)
 *  - {@code analystComment}: the analyst's free-text decision note (replaces the
 *    older {@code decision_reason} column — same meaning, clearer name)
 *  - {@code trustDelta}: the receiver's trust-score change applied as a result of
 *    this decision. Stored even when the receiver is not a PayZo client (so the
 *    history shows the rule's intent regardless of whether it took effect).
 */
@Entity
@Table(name = "fraud_alerts")
@Getter
@Setter
public class FraudAlert {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(updatable = false, nullable = false)
    private UUID id;

    /** One alert per transaction — enforced by UNIQUE constraint on the FK column */
    @OneToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "transaction_id", nullable = false, unique = true)
    private Transaction transaction;

    /** Null until an analyst claims and acts on the alert */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "analyst_id")
    private User analyst;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private AlertStatus status = AlertStatus.PENDING;

    /**
     * Up to a handful of short, human-readable strings captured from the ML scorer
     * at suspension time, e.g. "Amount is 20× the user's 24h average". Empty list
     * (rather than null) when the model produced none.
     */
    @JdbcTypeCode(SqlTypes.ARRAY)
    @Column(name = "ml_reasons", columnDefinition = "text[]")
    private List<String> mlReasons;

    /** Free-text note typed by the analyst when approving or rejecting. */
    @Column(name = "analyst_comment", columnDefinition = "TEXT")
    private String analystComment;

    /**
     * Receiver-side trust score delta applied by the analyst's decision (signed).
     * Null while the alert is still PENDING; set on approve / reject. Persisted
     * even when the receiver is not a PayZo client so the audit reflects intent.
     */
    @Column(name = "trust_delta")
    private Integer trustDelta;

    @Column(name = "decided_at")
    private OffsetDateTime decidedAt;

    @Column(name = "created_at", nullable = false, updatable = false)
    private OffsetDateTime createdAt;

    @PrePersist
    protected void onCreate() {
        createdAt = OffsetDateTime.now();
    }
}
