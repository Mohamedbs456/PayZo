package com.payzo.backend.dto.client;

import com.payzo.backend.domain.enums.UserStatus;

import java.time.LocalDate;
import java.util.UUID;

/**
 * Joined view of a client (Batch 9 / D2 mental model).
 * Combines payzo_db.users (PayZo state) with cbs_db.cbs_clients (national identity).
 * Everything that goes stale (address, phone, dob...) is sourced from CBS;
 * everything PayZo owns (status, trustScore, defaultAccountId...) is sourced from users.
 */
public record ClientProfile(
        UUID id,
        UUID keycloakId,
        String cin,
        String username,

        // From users (B-practical: cached, used for search/display)
        String firstName,
        String lastName,
        String profilePictureUrl,
        Integer trustScore,
        String defaultAccountId,
        UserStatus status,
        boolean firstLoginCompleted,

        // From CBS (authoritative — never duplicated locally)
        String email,
        String phone,
        String address,
        String governorate,
        LocalDate dateOfBirth
) {
}
