package com.payzo.backend.util;

import com.payzo.backend.exception.ConflictException;
import com.payzo.backend.util.NotificationCursor.Decoded;
import org.junit.jupiter.api.Test;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class NotificationCursorTest {

    @Test
    void encode_decode_roundTrip_preservesTimestampAndId() {
        OffsetDateTime ts = OffsetDateTime.of(2026, 5, 5, 12, 30, 45, 0, ZoneOffset.UTC);
        UUID id = UUID.randomUUID();

        String cursor = NotificationCursor.encode(ts, id);
        Decoded decoded = NotificationCursor.decode(cursor);

        assertThat(decoded.id()).isEqualTo(id);
        // Compare via epoch millis since the round-trip normalizes to UTC.
        assertThat(decoded.createdAt().toInstant().toEpochMilli())
                .isEqualTo(ts.toInstant().toEpochMilli());
    }

    @Test
    void encoded_cursorIsBase64Url_withoutPadding() {
        String cursor = NotificationCursor.encode(
                OffsetDateTime.now(ZoneOffset.UTC), UUID.randomUUID());
        // No padding `=` in URL-safe Base64
        assertThat(cursor).doesNotContain("=");
        // Only URL-safe alphabet
        assertThat(cursor).matches("^[A-Za-z0-9_-]+$");
    }

    @Test
    void decode_rejectsMalformedCursor() {
        assertThatThrownBy(() -> NotificationCursor.decode("not-base64!"))
                .isInstanceOf(ConflictException.class)
                .hasMessageContaining("cursor");
    }

    @Test
    void decode_rejectsCursorWithoutSeparator() {
        // Valid base64 but no "|" inside the payload
        String bad = java.util.Base64.getUrlEncoder().withoutPadding()
                .encodeToString("nopipehere".getBytes());
        assertThatThrownBy(() -> NotificationCursor.decode(bad))
                .isInstanceOf(ConflictException.class);
    }

    @Test
    void decode_rejectsCursorWithBadUuid() {
        String bad = java.util.Base64.getUrlEncoder().withoutPadding()
                .encodeToString("12345|not-a-uuid".getBytes());
        assertThatThrownBy(() -> NotificationCursor.decode(bad))
                .isInstanceOf(ConflictException.class);
    }
}
