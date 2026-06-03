package com.payzo.backend.dto.request.analyst;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.math.BigDecimal;

@Data
public class ThresholdReportRequest {

    @NotNull
    @DecimalMin("0.001")
    @DecimalMax("0.999")
    private BigDecimal suggestedLowMedium;

    @NotNull
    @DecimalMin("0.001")
    @DecimalMax("0.999")
    private BigDecimal suggestedMediumHigh;

    @NotBlank
    private String description;

    @NotBlank
    private String justification;
}
