package com.payzo.backend.dto.response.analyst;

import lombok.Builder;
import lombok.Data;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.UUID;

@Data
@Builder
public class ThresholdReportResponse {
    private UUID id;
    private UUID analystId;
    private String analystName;
    private BigDecimal suggestedLowMedium;
    private BigDecimal suggestedMediumHigh;
    private String description;
    private String justification;
    private OffsetDateTime submittedAt;
    private OffsetDateTime readAt;
}
