package com.payzo.backend.dto.response.superadmin;

import com.payzo.backend.domain.enums.Role;
import com.payzo.backend.domain.enums.UserStatus;
import lombok.Builder;
import lombok.Data;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * Single DTO for admins/analysts on the Staff Management page — minimal row
 * fields plus the extras the expanded panel needs. Lifecycle attribution
 * mirrors the Clients page (decidedByName / decidedAt).
 */
@Data
@Builder
public class UserResponse {

    private UUID id;
    private UUID keycloakId;
    private String username;
    private String firstName;
    private String lastName;
    private String email;
    private String phone;
    private String governorate;
    private String address;
    private LocalDate dateOfBirth;
    private String profilePictureUrl;
    private Role role;
    private UserStatus status;
    private OffsetDateTime createdAt;
    private OffsetDateTime updatedAt;

    private boolean firstLoginCompleted;

    /** Pre-formatted "SuperAdmin · First Last" — null for system-created rows. */
    private String createdByName;
    /** Pre-formatted "SuperAdmin · First Last" — null when no decision yet. */
    private String decidedByName;
    private OffsetDateTime decidedAt;
    private String decisionReason;
}
