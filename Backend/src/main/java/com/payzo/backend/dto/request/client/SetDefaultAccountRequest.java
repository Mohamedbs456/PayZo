package com.payzo.backend.dto.request.client;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import lombok.Data;

/**
 * Body for {@code PATCH /client/profile/default-account}. The
 * client picked one of their CBS account numbers from the dropdown
 * in the personal-info panel; the backend validates that the account
 * actually belongs to them (CBS lookup by accountNumber → assert
 * {@code clientCin == client.cin}) before persisting on the row.
 */
@Data
public class SetDefaultAccountRequest {

    /** 20-digit Tunisian RIB — same format as every other account number on the platform (D49). */
    @NotBlank
    @Pattern(regexp = "^\\d{20}$", message = "Account number must be a 20-digit RIB")
    private String accountNumber;
}
