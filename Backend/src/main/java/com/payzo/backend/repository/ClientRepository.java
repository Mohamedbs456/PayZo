package com.payzo.backend.repository;

import com.payzo.backend.domain.entity.Client;
import com.payzo.backend.domain.enums.UserStatus;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.OffsetDateTime;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface ClientRepository extends JpaRepository<Client, UUID>, JpaSpecificationExecutor<Client> {

    Optional<Client> findByCin(String cin);

    /** Batch variant used by BeneficiaryService.list() to resolve which beneficiaries are PayZo users. */
    List<Client> findByCinIn(Collection<String> cins);

    boolean existsByCin(String cin);

    Page<Client> findByStatus(UserStatus status, Pageable pageable);

    /** Used by admin dashboard's "Clients per bank" aggregation. */
    List<Client> findByStatus(UserStatus status);

    long countByStatus(UserStatus status);

    /** Dashboard — recent subscriptions within a time window */
    List<Client> findByCreatedAtAfter(OffsetDateTime after);

    /**
     * Demo / fixture only. {@code User.@PrePersist} unconditionally stamps
     * {@code createdAt} = {@code now()} on insert, so {@code DemoSeedService}
     * needs a follow-up UPDATE to backdate it. This drives
     * {@code senderAccountAgeDays} at scoring time so a "900-day-old account"
     * actually reads as 900 days old.
     */
    @Modifying
    @Query("UPDATE Client c SET c.createdAt = :ts WHERE c.id = :id")
    void backdateCreatedAt(@Param("id") UUID id, @Param("ts") OffsetDateTime ts);
}
