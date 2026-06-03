package com.payzo.backend.dto.request.auth;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import lombok.Data;

@Data
public class ForgotPasswordStartRequest {

    @NotBlank
    @Pattern(regexp = "^\\d{8}$", message = "CIN must be exactly 8 numeric digits")
    private String cin;
}
