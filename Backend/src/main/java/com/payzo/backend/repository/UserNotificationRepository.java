package com.payzo.backend.repository;

import com.payzo.backend.domain.entity.UserNotification;
import com.payzo.backend.domain.enums.UserNotificationType;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

@Repository
public interface UserNotificationRepository extends JpaRepository<UserNotification, UUID> {

    /** Bell dropdown — newest first, paginated */
    Page<UserNotification> findByUserIdOrderByCreatedAtDesc(UUID userId, Pageable pageable);

    /**
     * Unread-count badge — uses idx_user_notif_user_unread composite index.
     * Property name is {@code read} (the entity field), not {@code isRead},
     * so Spring Data derives the correct WHERE clause.
     */
    long countByUserIdAndReadFalse(UUID userId);

    /** Mark-all-read: load all unread rows for the user so the service can batch-save them */
    Page<UserNotification> findByUserIdAndReadFalseOrderByCreatedAtDesc(UUID userId, Pageable pageable);

    /**
     * Cursor-paginated fetch — no type filter (the bell dropdown's default).
     * The service substitutes a `(MAX, MAX)` sentinel for the first-page case
     * so the cursor comparison is always satisfied; this avoids the
     * Postgres "could not determine data type of parameter" error that
     * `:p IS NULL` triggers when the param is bound as untyped null.
     */
    @Query("""
            SELECT n FROM UserNotification n
            WHERE n.user.id = :userId
              AND (
                    n.createdAt <  :cursorCreatedAt
                    OR (n.createdAt = :cursorCreatedAt AND n.id < :cursorId)
                  )
            ORDER BY n.createdAt DESC, n.id DESC
            """)
    List<UserNotification> findPageWithCursor(
            @Param("userId") UUID userId,
            @Param("cursorCreatedAt") OffsetDateTime cursorCreatedAt,
            @Param("cursorId") UUID cursorId,
            Pageable pageable);

    /** Same as {@link #findPageWithCursor} but additionally constrained by type. */
    @Query("""
            SELECT n FROM UserNotification n
            WHERE n.user.id = :userId
              AND n.type = :type
              AND (
                    n.createdAt <  :cursorCreatedAt
                    OR (n.createdAt = :cursorCreatedAt AND n.id < :cursorId)
                  )
            ORDER BY n.createdAt DESC, n.id DESC
            """)
    List<UserNotification> findPageWithCursorByType(
            @Param("userId") UUID userId,
            @Param("type") UserNotificationType type,
            @Param("cursorCreatedAt") OffsetDateTime cursorCreatedAt,
            @Param("cursorId") UUID cursorId,
            Pageable pageable);

    /** Client/user deletion cascade: drop the in-app bell history for this user. */
    @Modifying
    @Query("DELETE FROM UserNotification n WHERE n.user.id = :userId")
    void deleteByUserId(@Param("userId") UUID userId);
}
