package com.payzo.backend.repository;

import com.payzo.backend.domain.entity.Transaction;
import com.payzo.backend.domain.enums.TransactionStatus;
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
public interface TransactionRepository extends JpaRepository<Transaction, UUID>, JpaSpecificationExecutor<Transaction> {

    Optional<Transaction> findByReference(String reference);

    /** Transfer pipeline: reject with HTTP 409 if client already has an in-progress transfer */
    boolean existsByClientIdAndStatusIn(UUID clientId, List<TransactionStatus> statuses);

    /** Client account history — PayZo DB only, not CBS pre-seeded records */
    Page<Transaction> findBySourceAccountNumberOrDestinationAccountNumberOrderByCreatedAtDesc(
            String sourceAccountNumber, String destinationAccountNumber, Pageable pageable);

    /** Bank deactivation cascade: find suspended transfers that reference the bank */
    List<Transaction> findBySourceBankCodeAndStatusIn(String sourceBankCode, List<TransactionStatus> statuses);

    List<Transaction> findByDestBankCodeAndStatusIn(String destBankCode, List<TransactionStatus> statuses);

    /** Bank deletion safeguard: any reference at all (any status) prevents deletion */
    boolean existsBySourceBankCode(String sourceBankCode);

    boolean existsByDestBankCode(String destBankCode);

    long countByStatusAndCreatedAtBetween(TransactionStatus status, OffsetDateTime start, OffsetDateTime end);

    long countByCreatedAtBetween(OffsetDateTime start, OffsetDateTime end);

    /** Dashboard: all transactions in a time window */
    List<Transaction> findByCreatedAtAfter(OffsetDateTime after);

    /** Velocity features: sender's activity in the last 24 h */
    List<Transaction> findByClientIdAndCreatedAtAfterAndStatusNotIn(
            UUID clientId, OffsetDateTime after, List<TransactionStatus> excludedStatuses);

    /** Client deletion cascade: drop the client's full transaction history. */
    @Modifying
    @Query("DELETE FROM Transaction t WHERE t.client.id = :clientId")
    void deleteByClientId(@Param("clientId") UUID clientId);

    /**
     * v4.2 escalation feature: max amount the client has ever sent to a specific
     * destination account, considering only transactions strictly before the given
     * cutoff. Returns null if there are no prior transfers — caller should treat
     * null as "first transfer" and use the current amount as the floor.
     *
     * <p>Retained for legacy callers; v5 fraud-detection no longer uses this in the
     * ML feature vector but the SQL is cheap to keep.
     */
    @Query("SELECT MAX(t.amount) FROM Transaction t WHERE t.client.id = :clientId "
            + "AND t.destinationAccountNumber = :destAccountNumber "
            + "AND t.createdAt < :before")
    java.math.BigDecimal findMaxAmountToDestBefore(
            @Param("clientId") UUID clientId,
            @Param("destAccountNumber") String destAccountNumber,
            @Param("before") OffsetDateTime before);

    /**
     * v5 per-user-norm feature: max APPROVED transfer amount this client has ever
     * sent (lifetime, any destination). Drives `amount_pct_of_user_max_lifetime` —
     * the ratio of the current amount to this max. Returns null for first-ever
     * senders; caller defaults the ratio to 1.0 in that case.
     */
    @Query("SELECT MAX(t.amount) FROM Transaction t WHERE t.client.id = :clientId "
            + "AND t.status = com.payzo.backend.domain.enums.TransactionStatus.APPROVED")
    java.math.BigDecimal findMaxAmountByClientId(@Param("clientId") UUID clientId);

    /**
     * Demo / fixture only. {@code Transaction.@PrePersist} unconditionally
     * stamps {@code createdAt} = {@code now()} on insert, so backdating a
     * seeded row requires a follow-up UPDATE. Called by
     * {@code DemoSeedService} immediately after each seeded transaction is
     * persisted.
     */
    @org.springframework.data.jpa.repository.Modifying
    @Query("UPDATE Transaction t SET t.createdAt = :ts, t.updatedAt = :ts, "
            + "t.otpConfirmedAt = :ts, t.executedAt = :ts WHERE t.id = :id")
    void setHistoricalTimestamps(@Param("id") UUID id,
                                 @Param("ts") OffsetDateTime ts);
}
