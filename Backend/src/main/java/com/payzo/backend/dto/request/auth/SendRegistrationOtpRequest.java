package com.payzo.backend.dto.request.auth;

import com.payzo.backend.domain.enums.OtpChannel;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import lombok.Data;

/**
 * Body for {@code POST /api/v1/auth/register/send-otp}. The
 * channel-chooser page (signup step 2a) sends the CIN + the chosen
 * channel; the BE dispatches the OTP to exactly one of email/SMS
 * (never both) — same pattern as login's {@code /login/initiate-otp}.
 */
@Data
public class SendRegistrationOtpRequest {

    @NotBlank
    @Pattern(regexp = "^\\d{8}$", message = "CIN must be exactly 8 digits")
    private String cin;

    @NotNull
    private OtpChannel channel;
}
