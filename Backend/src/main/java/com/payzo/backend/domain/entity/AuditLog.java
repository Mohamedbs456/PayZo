package com.payzo.backend.domain.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

import java.time.OffsetDateTime;
import java.util.UUID;

/** Append-only event row keyed by actor + action + target, with a free-form {@code metadata} string per action and composite indexes for per-entity history and "decisions today" counters. */
@Entity
@Table(
    name = "audit_logs",
    indexes = {
        @Index(name = "idx_audit_actor",             columnList = "actor_id"),
        @Index(name = "idx_audit_target_type_id",    columnList = "target_type, target_id"),
        @Index(name = "idx_audit_action_created_at", columnList = "action, created_at")
    }
)
@Getter
@Setter
public class AuditLog {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(updatable = false, nullable = false)
    private UUID id;

    /** Null for system-triggered actions (e.g. bank deactivation cascade) */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "actor_id")
    private User actor;

    /** Denormalised — avoids a join when filtering audit logs by role */
    @Column(name = "actor_role", length = 20)
    private String actorRole;

    /**
     * Action constants (used as plain strings to avoid a separate enum table):
     * CLIENT_APPROVED | CLIENT_REJECTED | CLIENT_BLOCKED | CLIENT_UNBLOCKED |
     * TRANSFER_EXECUTED | FRAUD_ALERT_CREATED | ALERT_VALIDATED | ALERT_REJECTED |
     * BANK_DEACTIVATED | BANK_ACTIVATED | BANK_DELETED |
     * USER_CREATED | USER_UPDATED | USER_DELETED |
     * ML_THRESHOLD_UPDATED | FIRST_LOGIN_COMPLETE
     */
    @Column(nullable = false, length = 100)
    private String action;

    /** e.g. USER | TRANSACTION | ALERT | BANK */
    @Column(name = "target_type", length = 50)
    private String targetType;

    @Column(name = "target_id")
    private UUID targetId;

    /** JSON blob: old/new values, reason text, extra context */
    @Column(columnDefinition = "TEXT")
    private String metadata;

    @Column(name = "created_at", nullable = false, updatable = false)
    private OffsetDateTime createdAt;

    @PrePersist
    protected void onCreate() {
        createdAt = OffsetDateTime.now();
    }
}
