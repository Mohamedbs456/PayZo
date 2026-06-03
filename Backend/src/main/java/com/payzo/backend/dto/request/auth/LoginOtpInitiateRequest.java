package com.payzo.backend.dto.request.auth;

import com.payzo.backend.domain.enums.OtpChannel;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

@Data
public class LoginOtpInitiateRequest {

    @NotBlank
    private String accessToken;

    /**
     * Delivery channel chosen on {@code /login/channel}. Required so the
     * backend dispatches to exactly one of email/SMS instead of spraying
     * both. Validated as non-null — a missing or unknown value returns
     * 400 from the controller layer (see {@code LoginOtpInitiateRequestValidationTest}).
     */
    @NotNull
    private OtpChannel channel;
}
