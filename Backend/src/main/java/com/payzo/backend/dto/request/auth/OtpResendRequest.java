package com.payzo.backend.dto.request.auth;

import com.payzo.backend.domain.enums.OtpPurpose;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

@Data
public class OtpResendRequest {

    @NotBlank
    private String identifier;

    @NotNull
    private OtpPurpose purpose;
}
