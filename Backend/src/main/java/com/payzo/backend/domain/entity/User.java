package com.payzo.backend.domain.entity;

import com.payzo.backend.domain.enums.Role;
import com.payzo.backend.domain.enums.UserStatus;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * Single Table Inheritance base.  All subtype columns live in the same `users` table.
 * `role` column doubles as the JPA discriminator (CLIENT | ADMIN | ANALYST | SUPERADMIN).
 *
 * Per DECISIONS.md D1, the personal fields (cin, address, governorate, profile_picture_url,
 * first_login_completed) and the auto-generated username live on the base — admins and
 * analysts can also have addresses, profile pictures, etc. STI subclasses keep only what
 * is genuinely role-specific (e.g. trust_score on Client per D12).
 */
@Entity
@Table(
    name = "users",
    indexes = {
        @Index(name = "idx_users_cin",         columnList = "cin"),
        @Index(name = "idx_users_username",    columnList = "username"),
        @Index(name = "idx_users_email",       columnList = "email"),
        @Index(name = "idx_users_status",      columnList = "status"),
        @Index(name = "idx_users_role",        columnList = "role"),
        @Index(name = "idx_users_keycloak_id", columnList = "keycloak_id")
    }
)
@Inheritance(strategy = InheritanceType.SINGLE_TABLE)
@DiscriminatorColumn(name = "role", discriminatorType = DiscriminatorType.STRING, length = 20)
@Getter
@Setter
public abstract class User {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(updatable = false, nullable = false)
    private UUID id;

    /** Set only when Keycloak user is created (on ACCEPT). Null for PENDING / REJECTED records. */
    @Column(name = "keycloak_id", unique = true)
    private UUID keycloakId;

    /** Tunisia national ID — 8 chars, unique. Nullable because backoffice users may not store it. */
    @Column(unique = true, length = 8)
    private String cin;

    /**
     * Auto-generated handle used for login-by-username and recipient lookup.
     * Unique across all users; nullable at the JPA level so legacy / partial seeds don't break,
     * but in practice every persisted user gets one.
     */
    @Column(unique = true, length = 64)
    private String username;

    @Column(name = "first_name", nullable = false, length = 100)
    private String firstName;

    @Column(name = "last_name", nullable = false, length = 100)
    private String lastName;

    // CBS-sourced for clients; populated on first profile sync.
    @Column(unique = true, length = 255)
    private String email;

    @Column(length = 20)
    private String phone;

    @Column(length = 50)
    private String governorate;

    @Column(length = 500)
    private String address;

    /**
     * Cached locally so the clients list view can show DOB without per-row CBS calls.
     * Source of truth is still CBS (set on registration / direct subscribe). Nullable
     * so backoffice rows (Admin/Analyst/SuperAdmin) — who don't carry a DOB — stay valid.
     */
    @Column(name = "date_of_birth")
    private LocalDate dateOfBirth;

    /** Path served via /api/v1/uploads/profile-pictures/{id}.jpg */
    @Column(name = "profile_picture_url", length = 500)
    private String profilePictureUrl;

    /**
     * True after the user completes first-login password change.
     * Uses columnDefinition (not nullable=false) per the STI gotcha in CLAUDE.md —
     * SuperAdmin / pending rows must be insertable without explicitly setting this.
     */
    @Column(name = "first_login_completed", columnDefinition = "boolean default false")
    private boolean firstLoginCompleted = false;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20, insertable = false, updatable = false)
    private Role role;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private UserStatus status = UserStatus.PENDING;

    /** Null for self-registered clients; set to the admin who approved / directly subscribed. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "created_by")
    private User createdBy;

    /**
     * Free-text reason captured the last time an admin/analyst/superadmin took a lifecycle
     * action (reject, block, unblock). Lets the backoffice show "Rejected by X on Y — Reason: …"
     * without scanning the audit log. Per JUSTIFICATION_ARCHITECTURE.md.
     */
    @Column(name = "decision_reason", columnDefinition = "TEXT")
    private String decisionReason;

    /** Admin/analyst/superadmin who took the most recent lifecycle action on this user. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "decided_by")
    private User decidedBy;

    @Column(name = "decided_at")
    private OffsetDateTime decidedAt;

    @Column(name = "created_at", nullable = false, updatable = false)
    private OffsetDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private OffsetDateTime updatedAt;

    @PrePersist
    protected void onCreate() {
        OffsetDateTime now = OffsetDateTime.now();
        createdAt  = now;
        updatedAt  = now;
    }

    @PreUpdate
    protected void onUpdate() {
        updatedAt = OffsetDateTime.now();
    }
}
