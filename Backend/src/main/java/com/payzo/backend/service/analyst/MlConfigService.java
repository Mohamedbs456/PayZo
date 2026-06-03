package com.payzo.backend.service.analyst;

import com.payzo.backend.domain.entity.MlModelConfig;
import com.payzo.backend.dto.response.analyst.MlConfigResponse;
import com.payzo.backend.dto.response.analyst.MlMetricsResponse;
import com.payzo.backend.repository.MlModelConfigRepository;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.reactive.function.client.WebClient;

/** Read-only view of {@code ml_model_config} thresholds and live metrics from the ML service, qualified to disambiguate from the SuperAdmin bean. */
@Service("analystMlConfigService")
@Slf4j
public class MlConfigService {

    private final MlModelConfigRepository mlModelConfigRepository;
    private final WebClient mlWebClient;

    public MlConfigService(MlModelConfigRepository mlModelConfigRepository,
                           @Qualifier("mlWebClient") WebClient mlWebClient) {
        this.mlModelConfigRepository = mlModelConfigRepository;
        this.mlWebClient = mlWebClient;
    }

    public MlMetricsResponse getMetrics() {
        try {
            MlMetricsResponse response = mlWebClient.get()
                    .uri("/metrics")
                    .retrieve()
                    .bodyToMono(MlMetricsResponse.class)
                    .block();
            if (response != null) {
                return response;
            }
            log.warn("ML metrics endpoint returned null");
            return new MlMetricsResponse();
        } catch (Exception e) {
            log.warn("ML metrics endpoint unavailable", e);
            return new MlMetricsResponse();
        }
    }

    @Transactional(readOnly = true)
    public MlConfigResponse getThresholds() {
        MlModelConfig config = mlModelConfigRepository.findFirstBy()
                .orElseThrow(() -> new IllegalStateException("ML config not seeded"));

        return MlConfigResponse.builder()
                .thresholdLowMedium(config.getThresholdLowMedium())
                .thresholdMediumHigh(config.getThresholdMediumHigh())
                .modelVersion(config.getModelVersion())
                .activeLayer(config.getActiveLayer())
                .updatedAt(config.getUpdatedAt())
                .build();
    }
}
