package com.payzo.backend.dto.response.auth;

import lombok.AllArgsConstructor;
import lombok.Data;

import java.util.UUID;

/**
 * Response shape for {@code POST /api/v1/auth/login/preview-channels}.
 * Both masked fields are pre-formatted by the BE so the FE renders the
 * picker without owning the masking rules.
 */
@Data
@AllArgsConstructor
public class PreviewLoginChannelsResponse {
    private UUID userId;
    private String maskedEmail;
    private String maskedPhone;
}
