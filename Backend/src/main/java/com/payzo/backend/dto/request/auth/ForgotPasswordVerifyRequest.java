package com.payzo.backend.dto.request.auth;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import lombok.Data;

@Data
public class ForgotPasswordVerifyRequest {

    @NotBlank
    @Pattern(regexp = "^\\d{8}$", message = "CIN must be exactly 8 numeric digits")
    private String cin;

    @NotBlank
    @Pattern(regexp = "^\\d{6}$", message = "OTP code must be exactly 6 numeric digits")
    private String otpCode;
}
