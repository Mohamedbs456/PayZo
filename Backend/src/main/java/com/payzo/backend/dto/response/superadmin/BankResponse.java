package com.payzo.backend.dto.response.superadmin;

import lombok.Builder;
import lombok.Data;

import java.time.OffsetDateTime;
import java.util.UUID;

@Data
@Builder
public class BankResponse {

    private UUID id;
    private String name;
    private String code;
    private String numericCode;
    private String logoUrl;
    private boolean active;
    private OffsetDateTime bankNameSyncedAt;
    private OffsetDateTime createdAt;
    private OffsetDateTime updatedAt;
}
