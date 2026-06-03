package com.payzo.backend.dto.response.analyst;

import com.payzo.backend.domain.enums.ActiveLayer;
import lombok.Builder;
import lombok.Data;

import java.math.BigDecimal;
import java.time.OffsetDateTime;

@Data
@Builder
public class MlConfigResponse {

    private BigDecimal thresholdLowMedium;
    private BigDecimal thresholdMediumHigh;
    private String modelVersion;
    private ActiveLayer activeLayer;
    private OffsetDateTime updatedAt;
}
