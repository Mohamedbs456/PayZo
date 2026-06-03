package com.payzo.backend.dto.request.client;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

@Data
public class UsernameResolveRequest {

    @NotBlank
    @Size(max = 64)
    private String username;
}
