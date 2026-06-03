package com.payzo.backend.util;

import com.payzo.backend.exception.ConflictException;

import java.nio.charset.StandardCharsets;
import java.time.OffsetDateTime;
import java.util.Base64;
import java.util.UUID;

/**
 * Opaque cursor for the backoffice notifications feed (Impact 26).
 *
 * Encodes {@code (createdAt epochMillis | id)} as Base64 — the {@code id} acts as
 * a tiebreaker when two rows share the same millisecond timestamp, so the page
 * boundary is deterministic. Clients treat the cursor as opaque and just round-trip it.
 */
public final class NotificationCursor {

    private NotificationCursor() {}

    public record Decoded(OffsetDateTime createdAt, UUID id) {}

    public static String encode(OffsetDateTime createdAt, UUID id) {
        String payload = createdAt.toInstant().toEpochMilli() + "|" + id;
        return Base64.getUrlEncoder().withoutPadding()
                .encodeToString(payload.getBytes(StandardCharsets.UTF_8));
    }

    public static Decoded decode(String cursor) {
        try {
            String payload = new String(
                    Base64.getUrlDecoder().decode(cursor), StandardCharsets.UTF_8);
            String[] parts = payload.split("\\|", 2);
            if (parts.length != 2) {
                throw new IllegalArgumentException("malformed cursor");
            }
            long epochMillis = Long.parseLong(parts[0]);
            UUID id = UUID.fromString(parts[1]);
            return new Decoded(
                    OffsetDateTime.ofInstant(java.time.Instant.ofEpochMilli(epochMillis),
                            java.time.ZoneOffset.UTC),
                    id);
        } catch (RuntimeException e) {
            throw new ConflictException("Invalid cursor", "INVALID_CURSOR");
        }
    }
}
