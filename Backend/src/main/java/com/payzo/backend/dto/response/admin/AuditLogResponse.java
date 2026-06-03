package com.payzo.backend.dto.response.admin;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.OffsetDateTime;
import java.util.UUID;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class AuditLogResponse {

    private UUID id;
    private String actorRole;
    private String action;
    private String targetType;
    private UUID targetId;
    private String metadata;
    private OffsetDateTime createdAt;
}
