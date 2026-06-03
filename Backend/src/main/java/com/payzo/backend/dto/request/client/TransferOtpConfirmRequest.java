package com.payzo.backend.dto.request.client;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

@Data
public class TransferOtpConfirmRequest {

    @NotBlank
    @Size(min = 6, max = 6)
    private String otpCode;
}
