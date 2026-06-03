package com.payzo.backend.repository;

import com.payzo.backend.domain.entity.AuditLog;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.OffsetDateTime;
import java.util.UUID;

@Repository
public interface AuditLogRepository extends JpaRepository<AuditLog, UUID> {

    /** Admin / analyst decision history — newest first */
    Page<AuditLog> findByActorIdOrderByCreatedAtDesc(UUID actorId, Pageable pageable);

    /** Audit trail for a specific entity (e.g. all events on transaction X) */
    Page<AuditLog> findByTargetTypeAndTargetIdOrderByCreatedAtDesc(
            String targetType, UUID targetId, Pageable pageable);

    /** Dashboard KPI — count decisions made by an admin after a given timestamp */
    long countByActorIdAndCreatedAtAfter(UUID actorId, OffsetDateTime after);

    /**
     * Drop audit rows where this user is the actor (FK constraint requires
     * the cascade) or where they're the target of a USER-typed event (no FK
     * but still pointless to keep after deletion).
     */
    @Modifying
    @Query("""
            DELETE FROM AuditLog a
            WHERE a.actor.id = :userId
               OR (a.targetType = 'USER' AND a.targetId = :userId)
            """)
    void deleteByActorIdOrTargetId(@Param("userId") UUID userId);
}
