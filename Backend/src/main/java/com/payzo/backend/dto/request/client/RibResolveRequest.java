package com.payzo.backend.dto.request.client;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

@Data
public class RibResolveRequest {

    @NotBlank
    private String rib;
}
