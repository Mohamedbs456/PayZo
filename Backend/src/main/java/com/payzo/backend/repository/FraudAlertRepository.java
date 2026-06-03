package com.payzo.backend.repository;

import com.payzo.backend.domain.entity.FraudAlert;
import com.payzo.backend.domain.enums.AlertStatus;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface FraudAlertRepository extends JpaRepository<FraudAlert, UUID>, JpaSpecificationExecutor<FraudAlert> {

    Optional<FraudAlert> findByTransactionId(UUID transactionId);

    Page<FraudAlert> findByStatus(AlertStatus status, Pageable pageable);

    long countByStatus(AlertStatus status);

    long countByAnalystIdAndDecidedAtBetween(UUID analystId, OffsetDateTime start, OffsetDateTime end);

    long countByCreatedAtBetween(OffsetDateTime start, OffsetDateTime end);

    long countByStatusAndCreatedAtBetween(AlertStatus status, OffsetDateTime start, OffsetDateTime end);

    List<FraudAlert> findByCreatedAtAfter(OffsetDateTime after);

    /**
     * Client deletion cascade: drop alerts tied to the client's transactions.
     * Must run BEFORE TransactionRepository.deleteByClientId so the FK
     * (fraud_alerts.transaction_id → transactions.id) doesn't block.
     */
    @Modifying
    @Query("DELETE FROM FraudAlert fa WHERE fa.transaction.client.id = :clientId")
    void deleteByTransactionClientId(@Param("clientId") java.util.UUID clientId);
}
