package com.payzo.backend.dto.request.me;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

/**
 * Body for {@code POST /api/v1/me/password/initiate}. Step 1 of the BO 2-step
 * password-change flow: backend verifies the current password against the
 * backoffice realm and emails a 6-digit OTP if it matches.
 */
@Data
public class InitiatePasswordChangeRequest {

    @NotBlank
    private String currentPassword;
}
