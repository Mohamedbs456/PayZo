package com.payzo.backend.dto.request.auth;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

@Data
public class RegistrationStep1Request {

    @NotBlank
    @Size(min = 8, max = 8)
    private String cin;
}
