package com.payzo.backend.dto.response.auth;

import lombok.AllArgsConstructor;
import lombok.Data;

/**
 * Response from {@code POST /api/v1/auth/forgot-password/verify-otp}. The reset
 * token is the credential the frontend hands back to {@code /reset} along with
 * the new password. 5-minute TTL — minted by {@link com.payzo.backend.service.auth.PasswordResetTokenService}.
 */
@Data
@AllArgsConstructor
public class ForgotPasswordTokenResponse {
    private String resetToken;
}
