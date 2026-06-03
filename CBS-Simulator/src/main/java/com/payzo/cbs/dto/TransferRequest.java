package com.payzo.cbs.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;

import java.math.BigDecimal;

public record TransferRequest(
        @NotBlank String sourceAccount,
        @NotBlank String destAccount,
        @NotNull @Positive BigDecimal amount
) {}
