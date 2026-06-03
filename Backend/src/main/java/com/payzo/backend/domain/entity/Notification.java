package com.payzo.backend.domain.entity;

import com.payzo.backend.domain.enums.NotificationStatus;
import com.payzo.backend.domain.enums.NotificationType;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

import java.time.OffsetDateTime;
import java.util.UUID;

/** Email / SMS delivery log. One row per send attempt. */
@Entity
@Table(name = "notifications")
@Getter
@Setter
public class Notification {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(updatable = false, nullable = false)
    private UUID id;

    /**
     * Null when the user does not exist yet — e.g. Step-1 OTP is sent
     * before the Client record is created.
     */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "recipient_id")
    private User recipient;

    @Column(name = "recipient_email", length = 255)
    private String recipientEmail;

    @Column(name = "recipient_phone", length = 20)
    private String recipientPhone;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 10)
    private NotificationType type;

    /**
     * Keys: OTP | WELCOME_PENDING | CREDENTIALS | REJECTION |
     *       TRANSFER_APPROVED | TRANSFER_REJECTED |
     *       ACCOUNT_BLOCKED | ACCOUNT_UNBLOCKED | BANK_DEACTIVATED
     */
    @Column(name = "template_key", nullable = false, length = 100)
    private String templateKey;

    /** Email subject only — null for SMS rows */
    @Column(length = 500)
    private String subject;

    @Column(nullable = false, columnDefinition = "TEXT")
    private String content;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 10)
    private NotificationStatus status = NotificationStatus.PENDING;

    /** Incremented on each retry attempt. Max 3 retries per PLAN.md Section 8.4 */
    @Column(name = "retry_count", nullable = false)
    private int retryCount = 0;

    @Column(name = "sent_at")
    private OffsetDateTime sentAt;

    @Column(name = "created_at", nullable = false, updatable = false)
    private OffsetDateTime createdAt;

    @PrePersist
    protected void onCreate() {
        createdAt = OffsetDateTime.now();
    }
}
