package com.payzo.backend.dto.request.me;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import lombok.Data;

/**
 * Body for {@code PATCH /api/v1/me/password}. Step 2 of the BO 2-step
 * password-change flow: backend validates the OTP from step 1 and applies
 * the new password (after running it through {@code PasswordPolicy}).
 */
@Data
public class ConfirmPasswordChangeRequest {

    @NotBlank
    @Pattern(regexp = "^\\d{6}$", message = "OTP must be exactly 6 digits")
    private String otp;

    @NotBlank
    private String newPassword;
}
