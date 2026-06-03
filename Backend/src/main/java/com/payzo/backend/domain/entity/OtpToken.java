package com.payzo.backend.domain.entity;

import com.payzo.backend.domain.enums.OtpPurpose;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

import java.time.OffsetDateTime;
import java.util.UUID;

/** Persisted OTP token, flipped {@code used=true} on validation (never deleted) so audit can still trace it after the 5-minute TTL. */
@Entity
@Table(
    name = "otp_tokens",
    indexes = {
        /* Critical for fast OTP lookup — used on every OTP validation request */
        @Index(name = "idx_otp_identifier_purpose_unused",
               columnList = "identifier, purpose, used")
    }
)
@Getter
@Setter
public class OtpToken {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(updatable = false, nullable = false)
    private UUID id;

    /**
     * CIN string for REGISTRATION purpose;
     * user UUID (as string) for LOGIN / TRANSFER_CONFIRMATION / PASSWORD_CHANGE.
     */
    @Column(nullable = false, length = 255)
    private String identifier;

    @Column(name = "otp_code", nullable = false, length = 6)
    private String otpCode;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 30)
    private OtpPurpose purpose;

    /** NOW() + 5 minutes — set by OtpService at generation time */
    @Column(name = "expires_at", nullable = false)
    private OffsetDateTime expiresAt;

    @Column(nullable = false)
    private boolean used = false;

    /** Incremented on each wrong guess. Invalidated when attempts >= 3 */
    @Column(nullable = false)
    private int attempts = 0;

    @Column(name = "created_at", nullable = false, updatable = false)
    private OffsetDateTime createdAt;

    @PrePersist
    protected void onCreate() {
        createdAt = OffsetDateTime.now();
    }
}
