package com.payzo.backend.dto.request.superadmin;

import jakarta.validation.constraints.Size;
import lombok.Data;

@Data
public class BankLogoUpdateRequest {

    @Size(max = 500)
    private String logoUrl;
}
