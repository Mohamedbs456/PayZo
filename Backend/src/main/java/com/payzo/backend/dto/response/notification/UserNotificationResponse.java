package com.payzo.backend.dto.response.notification;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.payzo.backend.domain.enums.UserNotificationType;
import lombok.Data;

import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * Wire shape consumed by the FE bell + notifications page. The FE
 * interfaces (Client-Web-App/.../notifications/api.ts) declare the
 * fields as {@code body} and {@code isRead}, while the entity + DB
 * column names use {@code message} / {@code read}. We don't rename
 * the fields here (the service code reads them via Lombok getters);
 * we just override the JSON property names with {@link JsonProperty}
 * so the wire shape matches what the FE expects. Without this, the
 * FE sees {@code n.isRead === undefined} for every notification —
 * which is falsy, so the bell forever shows them as unread even
 * after a successful mark-read round-trip.
 */
@Data
public class UserNotificationResponse {

    private UUID id;
    private String title;
    @JsonProperty("body")
    private String message;
    private UserNotificationType type;
    @JsonProperty("isRead")
    private boolean read;
    private OffsetDateTime createdAt;
}
