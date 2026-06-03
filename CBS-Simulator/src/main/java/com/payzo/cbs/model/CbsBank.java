package com.payzo.cbs.model;

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

/** Authoritative bank catalog (D48): PayZo's {@code banks} table mirrors this one and only opts each row in or out. */
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

    @Column(name = "numeric_code", nullable = false, length = 2, unique = true)
    private String numericCode;

    @Column(nullable = false, length = 100)
    private String name;

    @Column(name = "created_at", nullable = false)
    private OffsetDateTime createdAt;
}
