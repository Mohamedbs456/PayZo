package com.payzo.backend.domain.entity;

import com.payzo.backend.domain.enums.UserNotificationType;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

import java.time.OffsetDateTime;
import java.util.UUID;

/** In-app bell notification — one row per user per event. */
@Entity
@Table(
    name = "user_notifications",
    indexes = {
        /* Covers the unread-count badge query: WHERE user_id = ? AND is_read = false */
        @Index(name = "idx_user_notif_user_unread", columnList = "user_id, is_read")
    }
)
@Getter
@Setter
public class UserNotification {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(updatable = false, nullable = false)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @Column(nullable = false, length = 255)
    private String title;

    @Column(nullable = false, columnDefinition = "TEXT")
    private String message;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 50)
    private UserNotificationType type;

    /**
     * Field named {@code read} (not {@code isRead}) so that Lombok generates
     * {@code isRead()} / {@code setRead()} and Spring Data query property is
     * {@code read} — avoids the {@code isIsRead()} double-prefix bug.
     */
    @Column(name = "is_read", nullable = false)
    private boolean read = false;

    @Column(name = "created_at", nullable = false, updatable = false)
    private OffsetDateTime createdAt;

    @PrePersist
    protected void onCreate() {
        createdAt = OffsetDateTime.now();
    }
}
