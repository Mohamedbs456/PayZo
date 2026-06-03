package com.payzo.backend.dto.response.auth;

import lombok.AllArgsConstructor;
import lombok.Data;

/**
 * Response shape for {@code POST /api/v1/auth/register/preview}. The
 * "Verify your identity" page (signup step 1) renders this directly —
 * email and phone are pre-masked by the BE so the FE never sees raw
 * contact details before the user has confirmed their CIN matches.
 */
@Data
@AllArgsConstructor
public class RegistrationPreviewResponse {
    private String firstName;
    private String lastName;
    private String cin;
    /** Already masked, e.g. {@code ah***@gmail.com}. */
    private String email;
    /** Already masked, e.g. {@code +216 71 2** ***}. */
    private String phone;
    private String governorate;
}
