package com.payzo.backend.dto.response.client;

import lombok.Builder;
import lombok.Data;

import java.math.BigDecimal;

/**
 * Result of a between-my-accounts transfer (D8). The two new balances
 * let the client view refresh without an extra GET /client/accounts
 * round trip.
 */
@Data
@Builder
public class InternalTransferResponse {
    private String reference;
    private BigDecimal newSourceBalance;
    private BigDecimal newDestBalance;
}
