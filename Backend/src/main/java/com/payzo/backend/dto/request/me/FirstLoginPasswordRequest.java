package com.payzo.backend.dto.request.me;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

/**
 * Body for {@code PATCH /api/v1/me/password/first-login}. The forced
 * first-login rotation is a single-shot — no OTP, no current-password
 * verification — because the JWT itself proves the user just logged in
 * with the temp password we emailed them. The endpoint is one-time and
 * the service rejects subsequent calls (HTTP 409).
 */
@Data
public class FirstLoginPasswordRequest {

    @NotBlank
    private String newPassword;
}
