package com.payzo.backend.dto.response.me;

import com.payzo.backend.domain.enums.Role;
import com.payzo.backend.domain.enums.UserStatus;
import lombok.Builder;
import lombok.Data;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * "Me" payload for backoffice users — surfaces every field the
 * {@code /profile} page shows. Mirrors the columns we already store on the
 * shared {@code users} table; backoffice users carry the same personal info
 * (phone / governorate / address / DOB) as Clients per D1.
 */
@Data
@Builder
public class BoMeResponse {

    private UUID userId;
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
    /**
     * False until the user changes the temp password we email them on
     * account creation. Drives the FE auto-popping the change-password
     * modal right after first sign-in.
     */
    private boolean firstLoginCompleted;
}
