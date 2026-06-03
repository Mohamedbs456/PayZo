package com.payzo.backend.domain.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * PayZo's opt-in registry for CBS-owned banks. The authoritative catalog lives
 * in {@code cbs_db.cbs_banks}; this table caches {@code name} and
 * {@code numericCode} on each sync and owns the policy fields
 * ({@code active} flag and {@code logoUrl}). Rows here are created exclusively
 * by {@code BankSyncService} — the SuperAdmin only flips activation and
 * customizes the logo.
 */
@Entity
@Table(name = "banks")
@Getter
@Setter
public class Bank {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(updatable = false, nullable = false)
    private UUID id;

    @Column(nullable = false, length = 100)
    private String name;

    /** Short code e.g. ATB, BNA, BIAT — used as denormalised FK in the transactions table */
    @Column(nullable = false, unique = true, length = 10)
    private String code;

    /**
     * 2-digit Tunisian bank numeric code (the first two digits of every RIB
     * issued by this bank). Synced from {@code cbs_banks.numeric_code}.
     * Nullable for backward compat with pre-sync rows; new rows always have it.
     */
    @Column(name = "numeric_code", length = 2, unique = true)
    private String numericCode;

    @Column(name = "logo_url", length = 500)
    private String logoUrl;

    /**
     * Field named {@code active} (not {@code isActive}) so Lombok generates
     * {@code isActive()} / {@code setActive()} and Spring Data query property is
     * {@code active} — avoids the {@code isIsActive()} double-prefix bug.
     * false = all accounts from this bank are frozen.
     */
    @Column(name = "is_active", nullable = false)
    private boolean active = true;

    /** Timestamp of the last successful name refresh from CBS. */
    @Column(name = "bank_name_synced_at")
    private OffsetDateTime bankNameSyncedAt;

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
