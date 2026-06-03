package com.payzo.backend.dto.response.admin;

import lombok.AllArgsConstructor;
import lombok.Data;

import java.time.LocalDate;

/**
 * Identity preview shown in the Register-client dialog before the admin
 * confirms direct subscription. Sourced from CBS by CIN, plus a flag that
 * tells the FE whether the same CIN is *already* a PayZo client (so the
 * Create button can be disabled with a clear warning).
 */
@Data
@AllArgsConstructor
public class CbsClientPreviewResponse {
    private String cin;
    private String firstName;
    private String lastName;
    private String email;
    private String phone;
    private String governorate;
    private String address;
    private LocalDate dateOfBirth;
    /** True when payzo_db already has a Client with this CIN. */
    private boolean alreadyRegistered;
}
