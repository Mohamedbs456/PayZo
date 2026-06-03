package com.payzo.backend.repository;

import com.payzo.backend.domain.entity.Notification;
import com.payzo.backend.domain.enums.NotificationStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
public interface NotificationRepository extends JpaRepository<Notification, UUID> {

    /** Retry scheduler: FAILED notifications that haven't hit the 3-retry ceiling */
    List<Notification> findByStatusAndRetryCountLessThan(NotificationStatus status, int maxRetries);

    /** Client/user deletion cascade: drop the email/SMS log for this user. */
    @Modifying
    @Query("DELETE FROM Notification n WHERE n.recipient.id = :userId")
    void deleteByRecipientId(@Param("userId") UUID userId);
}
