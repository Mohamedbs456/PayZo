package com.payzo.backend.dto.request.client;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

/**
 * Body for {@code PATCH /api/v1/clients/me/password}.
 *
 * Backend re-verifies {@code currentPassword} against Keycloak before applying
 * {@code newPassword}, so the request is safe to accept even from a session that
 * is still valid. {@code newPassword} is policy-checked by
 * {@link com.payzo.backend.util.PasswordPolicy#enforce(String)} which produces
 * 422 with a structured violation list when the password is rejected.
 */
@Data
public class ChangePasswordRequest {

    @NotBlank
    private String currentPassword;

    @NotBlank
    private String newPassword;
}
