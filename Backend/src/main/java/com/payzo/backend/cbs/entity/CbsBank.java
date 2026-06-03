package com.payzo.backend.cbs.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.OffsetDateTime;

/**
 * Read-only mirror of {@code cbs_db.cbs_banks}. CBS owns the authoritative bank
 * catalog; PayZo reads it via this entity on the D2 datasource and reflects it
 * into {@code payzo_db.banks} through {@code BankSyncService}.
 */
@Entity
@Table(name = "cbs_banks")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class CbsBank {

    @Id
    @Column(length = 10)
    private String code;

    @Column(nullable = false, length = 2, unique = true)
    private String numericCode;

    @Column(nullable = false, length = 100)
    private String name;

    @Column(nullable = false)
    private OffsetDateTime createdAt;
}
