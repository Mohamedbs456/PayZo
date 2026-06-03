package com.payzo.backend.domain.entity;

import com.payzo.backend.domain.enums.ActiveLayer;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * Singleton row — DataInitializer inserts exactly one row on startup.
 * Services always read it as: findFirstBy().orElseThrow(IllegalStateException::new)
 */
@Entity
@Table(name = "ml_model_config")
@Getter
@Setter
public class MlModelConfig {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(updatable = false, nullable = false)
    private UUID id;

    /** Scores below this → LOW risk. Default 0.300 */
    @Column(name = "threshold_low_medium", nullable = false, precision = 4, scale = 3)
    private BigDecimal thresholdLowMedium = new BigDecimal("0.300");

    /** Scores above this → HIGH risk; between the two thresholds → MEDIUM. Default 0.700 */
    @Column(name = "threshold_medium_high", nullable = false, precision = 4, scale = 3)
    private BigDecimal thresholdMediumHigh = new BigDecimal("0.700");

    /** e.g. "xgb-transfer-v1" — set when the trained model is deployed */
    @Column(name = "model_version", length = 50)
    private String modelVersion;

    @Enumerated(EnumType.STRING)
    @Column(name = "active_layer", nullable = false, length = 10)
    private ActiveLayer activeLayer = ActiveLayer.PRIMARY;

    @Column(name = "updated_at", nullable = false)
    private OffsetDateTime updatedAt;

    @PrePersist
    @PreUpdate
    protected void onUpdate() {
        updatedAt = OffsetDateTime.now();
    }
}
