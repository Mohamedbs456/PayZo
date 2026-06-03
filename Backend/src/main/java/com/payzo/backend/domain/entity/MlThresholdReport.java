package com.payzo.backend.domain.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.UUID;

/** Analyst proposal to change {@code ml_model_config} cutoffs, carrying both numbers, a justification, and a PENDING / ACCEPTED / REJECTED status. */
@Entity
@Table(name = "ml_threshold_reports")
@Getter
@Setter
public class MlThresholdReport {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(updatable = false, nullable = false)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "analyst_id", nullable = false)
    private User analyst;

    @Column(name = "suggested_low_medium", nullable = false, precision = 4, scale = 3)
    private BigDecimal suggestedLowMedium;

    @Column(name = "suggested_medium_high", nullable = false, precision = 4, scale = 3)
    private BigDecimal suggestedMediumHigh;

    @Column(nullable = false, columnDefinition = "TEXT")
    private String description;

    @Column(nullable = false, columnDefinition = "TEXT")
    private String justification;

    @Column(name = "submitted_at", nullable = false, updatable = false)
    private OffsetDateTime submittedAt;

    @Column(name = "read_at")
    private OffsetDateTime readAt;

    @PrePersist
    protected void onCreate() {
        submittedAt = OffsetDateTime.now();
    }
}
