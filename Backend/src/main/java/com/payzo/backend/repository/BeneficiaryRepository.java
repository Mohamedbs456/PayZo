package com.payzo.backend.repository;

import com.payzo.backend.domain.entity.Beneficiary;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.Optional;
import java.util.UUID;

@Repository
public interface BeneficiaryRepository extends JpaRepository<Beneficiary, UUID> {

    Optional<Beneficiary> findByClientIdAndAccountNumber(UUID clientId, String accountNumber);

    Optional<Beneficiary> findByIdAndClientId(UUID id, UUID clientId);

    boolean existsByClientIdAndAccountNumber(UUID clientId, String accountNumber);

    /** Favorites pinned, then most-recently-used, then alphabetical fallback. */
    @Query("SELECT b FROM Beneficiary b WHERE b.client.id = :clientId "
            + "ORDER BY b.favorite DESC, b.lastUsedAt DESC NULLS LAST, b.cachedFirstName ASC")
    Page<Beneficiary> findAllForClient(@Param("clientId") UUID clientId, Pageable pageable);

    /** Client deletion cascade. */
    @Modifying
    @Query("DELETE FROM Beneficiary b WHERE b.client.id = :clientId")
    void deleteByClientId(@Param("clientId") UUID clientId);
}
