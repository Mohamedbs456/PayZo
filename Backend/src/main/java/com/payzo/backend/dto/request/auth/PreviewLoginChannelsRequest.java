package com.payzo.backend.dto.request.auth;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

/**
 * Body for {@code POST /api/v1/auth/login/preview-channels}. The
 * channel-chooser page sends the just-minted KC access token; the
 * backend decodes it, looks the user up, and returns masked
 * email/phone strings so the page can render
 * "EMAIL · ah•••@gmail.com" / "SMS · +216 71 2** ***" without a
 * second round trip.
 */
@Data
public class PreviewLoginChannelsRequest {

    @NotBlank
    private String accessToken;
}
