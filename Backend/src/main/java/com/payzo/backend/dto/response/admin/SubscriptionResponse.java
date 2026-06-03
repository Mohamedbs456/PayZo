package com.payzo.backend.dto.response.admin;

import com.payzo.backend.domain.enums.UserStatus;
import lombok.Data;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * Single DTO used for the entire Clients page — list rows AND expanded
 * row details. Backed by the User/Client STI hierarchy via UserMapper. The
 * "lifecycle" fields (decidedBy*, decisionReason, firstLoginCompleted) are
 * what enable the per-status expanded layouts (D30 / Clients page).
 */
@Data
public class SubscriptionResponse {

    private UUID userId;
    private UUID keycloakId;
    private String cin;
    private String username;
    private String firstName;
    private String lastName;
    private String email;
    private String phone;
    private String governorate;
    private String address;
    private LocalDate dateOfBirth;
    private String profilePictureUrl;
    private UserStatus status;
    private OffsetDateTime createdAt;
    private OffsetDateTime updatedAt;

    private boolean firstLoginCompleted;
    /** Client-only field — null when the row happens to be a non-Client subtype. */
    private Integer trustScore;
    /** 12-digit CBS account number the client has marked as their default
     *  destination/source. Used by the BO Accounts page to render a yellow
     *  star pill on the matching row in the expanded panel. */
    private String defaultAccountId;

    /** "Self-registered" when createdBy is null; otherwise "Admin · First Last". */
    private String createdByName;

    /** Pre-formatted "Admin · First Last" so the FE doesn't need to do the role lookup. */
    private String decidedByName;
    private OffsetDateTime decidedAt;
    private String decisionReason;
}
