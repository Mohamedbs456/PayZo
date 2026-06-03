package com.payzo.backend.cbs.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.UUID;

@Entity
@Table(name = "cbs_transactions")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class CbsTransaction {

    @Id
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "account_number", nullable = false)
    private CbsAccount account;

    @Column(name = "client_cin", nullable = false, length = 8)
    private String clientCin;

    /**
     * PayZo's TRX-XXXXXXXX reference if this row was created by the PayZo platform.
     * Null for pre-PayZo seeded transactions. Doubles as the discriminator:
     * referenceByPayZo IS NOT NULL ⟺ "by PayZo".
     */
    @Column(name = "reference_by_payzo", length = 20)
    private String referenceByPayZo;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private TransactionType type;

    @Column(nullable = false, precision = 15, scale = 2)
    private BigDecimal amount;

    @Column(length = 30)
    private String counterpartAccount;

    private String description;

    @Column(nullable = false)
    private OffsetDateTime timestamp;
}
