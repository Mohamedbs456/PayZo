package com.payzo.backend.dto.request.client;

import jakarta.validation.constraints.Size;
import lombok.Data;

@Data
public class BeneficiaryNicknameUpdateRequest {

    /** Null or blank clears the nickname (UI falls back to the cached name). */
    @Size(max = 64)
    private String nickname;
}
