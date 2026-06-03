package com.payzo.backend.domain.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * A client's saved recipient — identified by RIB rather than PayZo user id so the
 * same table holds both PayZo-resident and non-PayZo CBS recipients. Replaces the
 * old {@code favorites} table; {@code is_favorite} is now a column instead of the
 * existence-of-row signal.
 *
 * <p>Usage is recorded automatically by {@code TransferService} after every
 * APPROVED transfer (upsert): first transfer creates the row, subsequent ones
 * bump {@code transferCount} and {@code lastUsedAt}. The {@code confirmedAt}
 * timestamp captures the first successful debit and is what the UI can use to
 * show a "verified" badge for repeat recipients.
 *
 * <p>Cached names ({@code cachedFirstName}, {@code cachedLastName}) are refreshed
 * from CBS on each upsert; the source of truth is always CBS.
 */
@Entity
@Table(
        name = "beneficiaries",
        uniqueConstraints = @UniqueConstraint(
                name = "uk_beneficiaries_client_account",
                columnNames = {"client_id", "account_number"}
        ),
        indexes = {
                @Index(name = "idx_beneficiaries_client_favorite", columnList = "client_id,is_favorite"),
                @Index(name = "idx_beneficiaries_client_last_used", columnList = "client_id,last_used_at")
        }
)
@Getter
@Setter
public class Beneficiary {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(updatable = false, nullable = false)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "client_id", nullable = false)
    private Client client;

    @Column(name = "account_number", nullable = false, length = 20)
    private String accountNumber;

    @Column(name = "cached_first_name", nullable = false, length = 100)
    private String cachedFirstName;

    @Column(name = "cached_last_name", nullable = false, length = 100)
    private String cachedLastName;

    /** Sender-private label, e.g. "Mom" or "Plumber". */
    @Column(length = 64)
    private String nickname;

    /** Denormalised alpha mnemonic (STB / BIAT / …) — derivable from the RIB prefix but cached for query convenience. */
    @Column(name = "bank_code", length = 10)
    private String bankCode;

    @Column(name = "is_favorite", nullable = false)
    private boolean favorite = false;

    /** First successful debit to this RIB — set once, never updated. */
    @Column(name = "confirmed_at")
    private OffsetDateTime confirmedAt;

    @Column(name = "first_used_at")
    private OffsetDateTime firstUsedAt;

    @Column(name = "last_used_at")
    private OffsetDateTime lastUsedAt;

    @Column(name = "transfer_count", nullable = false)
    private int transferCount = 0;

    @Column(name = "created_at", nullable = false, updatable = false)
    private OffsetDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private OffsetDateTime updatedAt;

    @PrePersist
    protected void onCreate() {
        OffsetDateTime now = OffsetDateTime.now();
        createdAt = now;
        updatedAt = now;
    }

    @PreUpdate
    protected void onUpdate() {
        updatedAt = OffsetDateTime.now();
    }
}
