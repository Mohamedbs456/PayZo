package com.payzo.backend.dto.response.admin;

import lombok.AllArgsConstructor;
import lombok.Data;

import java.math.BigDecimal;

/**
 * Summary of a client's CBS state, fetched lazily by the Clients page when an
 * ACTIVE row is expanded. Kept tiny on purpose — the goal is just to avoid
 * an N+1 against CBS for every paged list response.
 */
@Data
@AllArgsConstructor
public class ClientCbsSummaryResponse {
    /** Number of CBS accounts this client owns (across all banks). */
    private int accountCount;
    /** Sum of balances across those accounts (TND). */
    private BigDecimal totalBalance;
}
