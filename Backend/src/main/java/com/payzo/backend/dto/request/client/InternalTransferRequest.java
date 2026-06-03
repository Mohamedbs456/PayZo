package com.payzo.backend.dto.request.client;

import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import lombok.Data;

import java.math.BigDecimal;

/**
 * Body for {@code POST /api/v1/client/transfers/internal} (D8). Both
 * accounts must belong to the authenticated client; that ownership
 * check happens server-side, not via the validator.
 */
@Data
public class InternalTransferRequest {

    @NotNull
    @Pattern(regexp = "^\\d{20}$", message = "Source account must be exactly 20 numeric digits (RIB)")
    private String sourceAccountNumber;

    @NotNull
    @Pattern(regexp = "^\\d{20}$", message = "Destination account must be exactly 20 numeric digits (RIB)")
    private String destAccountNumber;

    @NotNull
    @DecimalMin(value = "0.001", message = "Amount must be positive")
    private BigDecimal amount;

    @AssertTrue(message = "Source and destination accounts must differ")
    public boolean isDistinctAccounts() {
        return sourceAccountNumber == null
                || destAccountNumber == null
                || !sourceAccountNumber.equals(destAccountNumber);
    }
}
