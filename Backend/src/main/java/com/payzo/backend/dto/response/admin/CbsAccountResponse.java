package com.payzo.backend.dto.response.admin;

import lombok.AllArgsConstructor;
import lombok.Data;

import java.math.BigDecimal;

/**
 * Single CBS account row returned by the Accounts-page expanded view. Mirrors
 * {@code CbsIntegrationService.CbsAccountData} but lives in the admin DTO
 * package so the FE has a stable type to bind against.
 */
@Data
@AllArgsConstructor
public class CbsAccountResponse {
    private String accountNumber;
    private String bankCode;
    /** "CHECKING" or "SAVINGS" — uppercase, matches CBS enum. */
    private String type;
    private BigDecimal balance;
}
