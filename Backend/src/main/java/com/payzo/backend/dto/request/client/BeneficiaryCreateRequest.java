package com.payzo.backend.dto.request.client;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

/**
 * Body for {@code POST /api/v1/client/beneficiaries}. Sender saves a recipient
 * by RIB + first/last name; backend validates the RIB (mod-97) and verifies the
 * name against CBS before persisting.
 */
@Data
public class BeneficiaryCreateRequest {

    @NotBlank
    @Size(min = 20, max = 25)
    private String rib;

    @NotBlank
    @Size(max = 100)
    private String firstName;

    @NotBlank
    @Size(max = 100)
    private String lastName;

    /** Optional sender-private label. */
    @Size(max = 64)
    private String nickname;
}
