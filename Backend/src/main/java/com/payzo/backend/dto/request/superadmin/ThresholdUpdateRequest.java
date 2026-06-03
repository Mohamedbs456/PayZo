package com.payzo.backend.dto.request.superadmin;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.math.BigDecimal;

@Data
public class ThresholdUpdateRequest {

    @NotNull
    @DecimalMin("0.001")
    @DecimalMax("0.999")
    private BigDecimal thresholdLowMedium;

    @NotNull
    @DecimalMin("0.001")
    @DecimalMax("0.999")
    private BigDecimal thresholdMediumHigh;
}
