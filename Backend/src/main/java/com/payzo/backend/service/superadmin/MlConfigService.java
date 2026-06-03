package com.payzo.backend.service.superadmin;

import com.payzo.backend.domain.entity.MlModelConfig;
import com.payzo.backend.domain.entity.User;
import com.payzo.backend.domain.enums.Role;
import com.payzo.backend.domain.enums.UserNotificationType;
import com.payzo.backend.repository.MlModelConfigRepository;
import com.payzo.backend.repository.UserRepository;
import com.payzo.backend.service.audit.AuditService;
import com.payzo.backend.service.notification.InAppNotificationService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.reactive.function.client.WebClient;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/** Write side of {@code ml_model_config} (threshold updates, active-layer overrides) with an audit row and analyst fan-out per write (D36). */
@Service("superAdminMlConfigService")
@Slf4j
public class MlConfigService {

    private final MlModelConfigRepository mlModelConfigRepository;
    private final UserRepository userRepository;
    private final AuditService auditService;
    private final InAppNotificationService inAppNotificationService;
    private final WebClient mlWebClient;

    public MlConfigService(MlModelConfigRepository mlModelConfigRepository,
                           UserRepository userRepository,
                           AuditService auditService,
                           InAppNotificationService inAppNotificationService,
                           @Qualifier("mlWebClient") WebClient mlWebClient) {
        this.mlModelConfigRepository = mlModelConfigRepository;
        this.userRepository = userRepository;
        this.auditService = auditService;
        this.inAppNotificationService = inAppNotificationService;
        this.mlWebClient = mlWebClient;
    }

    @Transactional
    public void updateThresholds(BigDecimal thresholdLowMedium, BigDecimal thresholdMediumHigh,
                                 UUID superAdminId) {
        MlModelConfig config = mlModelConfigRepository.findFirstBy()
                .orElseThrow(() -> new IllegalStateException("ML config not seeded"));

        config.setThresholdLowMedium(thresholdLowMedium);
        config.setThresholdMediumHigh(thresholdMediumHigh);
        mlModelConfigRepository.save(config);

        pushThresholdsToMlService(thresholdLowMedium, thresholdMediumHigh);

        auditService.writeLog(superAdminId, "SUPERADMIN", "ML_THRESHOLDS_UPDATED",
                "ML_CONFIG", config.getId(),
                "low=" + thresholdLowMedium + " high=" + thresholdMediumHigh);

        List<User> analysts = userRepository.findByRole(Role.ANALYST);
        for (User analyst : analysts) {
            inAppNotificationService.create(analyst.getId(), "ML thresholds updated",
                    "SuperAdmin updated ML thresholds: LOW/MED=" + thresholdLowMedium + ", MED/HIGH=" + thresholdMediumHigh,
                    UserNotificationType.ML_THRESHOLDS_UPDATED);
        }

        log.info("Updated ML thresholds: low={}, high={}", thresholdLowMedium, thresholdMediumHigh);
    }

    private void pushThresholdsToMlService(BigDecimal low, BigDecimal high) {
        try {
            mlWebClient.post()
                    .uri("/admin/thresholds")
                    .bodyValue(Map.of(
                            "thresholdLowMedium", low,
                            "thresholdMediumHigh", high))
                    .retrieve()
                    .toBodilessEntity()
                    .block();
            log.info("Pushed thresholds to ML service");
        } catch (Exception e) {
            log.warn("Failed to push thresholds to ML service — DB updated, ML not reloaded", e);
        }
    }
}
