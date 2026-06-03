package com.payzo.backend.dto.request.auth;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

@Data
public class ForgotPasswordResetRequest {

    @NotBlank
    private String resetToken;

    /**
     * Validated server-side via {@link com.payzo.backend.util.PasswordPolicy} —
     * deliberately not annotated here so the policy violation produces 422 with
     * a structured violation list rather than a generic 400.
     */
    @NotBlank
    private String newPassword;
}
