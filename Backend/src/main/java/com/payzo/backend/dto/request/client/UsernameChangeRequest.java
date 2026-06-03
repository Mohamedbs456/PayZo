package com.payzo.backend.dto.request.client;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

/**
 * Body for {@code PATCH /api/v1/client/profile/username}. The leading
 * {@code @} should be stripped by the caller, but the service layer
 * normalises defensively via {@link com.payzo.backend.util.UsernameValidator}
 * so either shape is accepted.
 */
@Data
public class UsernameChangeRequest {

    @NotBlank
    @Size(max = 64)
    private String username;
}
