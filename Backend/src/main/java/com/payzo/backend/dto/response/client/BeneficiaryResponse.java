package com.payzo.backend.dto.response.client;

import lombok.Builder;
import lombok.Data;

import java.time.OffsetDateTime;
import java.util.UUID;

@Data
@Builder
public class BeneficiaryResponse {

    private UUID id;
    private String accountNumber;
    private String displayName;
    private String nickname;
    private String bankCode;
    private boolean favorite;
    private int transferCount;
    private OffsetDateTime confirmedAt;
    private OffsetDateTime lastUsedAt;
    private OffsetDateTime createdAt;
    /** Two-letter avatar fallback derived from cached first + last name. */
    private String initials;
    /** Relative path served via /api/v1/uploads/profile-pictures/{id}.jpg; null when recipient isn't a PayZo user. */
    private String profilePictureUrl;
    /** True when the recipient's CIN matches a PayZo Client; drives the bubble-row avatar fallback. */
    private boolean payzoUser;
}
