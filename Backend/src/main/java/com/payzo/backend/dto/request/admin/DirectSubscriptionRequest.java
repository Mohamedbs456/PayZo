package com.payzo.backend.dto.request.admin;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

@Data
public class DirectSubscriptionRequest {

    @NotBlank
    @Size(min = 8, max = 8)
    private String cin;
}
