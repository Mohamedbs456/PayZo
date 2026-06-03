package com.payzo.backend.dto.request.auth;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

@Data
public class RegistrationStep2Request {

    @NotBlank
    @Size(min = 8, max = 8)
    private String cin;

    @NotBlank
    @Size(min = 6, max = 6)
    private String otpCode;
}
