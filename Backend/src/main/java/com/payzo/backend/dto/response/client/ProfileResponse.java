package com.payzo.backend.dto.response.client;

import lombok.Builder;
import lombok.Data;

import java.time.LocalDate;
import java.util.UUID;

@Data
@Builder
public class ProfileResponse {

    private UUID id;
    private String cin;
    private String username;
    private String firstName;
    private String lastName;
    private String email;
    private String phone;
    // CBS-sourced (Batch 9 / D2) — never duplicated locally
    private String address;
    private String governorate;
    private LocalDate dateOfBirth;
    private String profilePictureUrl;
    /**
     * Drives the first-login forced password rotation modal on the
     * client dashboard. {@code false} means the client just got accepted
     * and hasn't rotated their admin-issued temp password yet — the FE
     * mounts {@code <FirstLoginPasswordModal/>} until it flips to
     * {@code true} via {@code POST /auth/first-login-complete}.
     */
    private boolean firstLoginCompleted;
    /**
     * 0–100. Drives the TopBar trust pill and the recipient confirmation
     * card. {@code null} means the row hasn't been initialised yet
     * (legacy data); the FE renders the pill only when this is a
     * number, so a missing value silently hides the pill rather than
     * displaying "undefined / 100".
     */
    private Integer trustScore;
    /**
     * 12-digit CBS account number the client wants incoming P2P
     * transfers to land in. Drives the ★ marker on the accounts page
     * and the {@code useDefaultAccount=true} branch of the send-money
     * resolver. Picked automatically at approval time; user can
     * override via {@code PATCH /client/profile/default-account}.
     */
    private String defaultAccountId;
}
