package com.payzo.backend.dto.response.auth;

import lombok.AllArgsConstructor;
import lombok.Data;

/**
 * Body returned by {@code POST /api/v1/auth/forgot-password/start}.
 * Always returned with HTTP 200, even when the CIN is unknown or the
 * account isn't eligible — anti-enumeration per D44. The FE renders
 * {@code maskedDestination} on the next page caption.
 */
@Data
@AllArgsConstructor
public class ForgotPasswordStartResponse {
    /** "EMAIL" | "SMS" — channel the BE chose. */
    private String deliveryChannel;
    /** Already-masked destination, e.g. {@code ah***@gmail.com}. */
    private String maskedDestination;
}
