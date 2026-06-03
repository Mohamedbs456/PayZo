package com.payzo.backend.dto.request.auth;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

import java.util.UUID;

@Data
public class OtpVerificationRequest {

    private UUID userId;

    @NotBlank
    @Size(min = 6, max = 6)
    private String otpCode;
}
