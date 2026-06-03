package com.payzo.backend.service.notification;

import com.payzo.backend.domain.entity.UserNotification;
import com.payzo.backend.domain.enums.UserNotificationType;
import com.payzo.backend.dto.response.common.CursorPagedResponse;
import com.payzo.backend.dto.response.notification.UserNotificationResponse;
import com.payzo.backend.exception.ResourceNotFoundException;
import com.payzo.backend.repository.UserNotificationRepository;
import com.payzo.backend.repository.UserRepository;
import com.payzo.backend.util.NotificationCursor;
import com.payzo.backend.util.NotificationCursor.Decoded;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

/** Writes {@code user_notifications} and reads them back with offset paging for the client bell and cursor paging for the BO feed. */
@Service
@RequiredArgsConstructor
@Slf4j
public class InAppNotificationService {

    private final UserNotificationRepository userNotificationRepository;
    private final UserRepository userRepository;

    @Transactional
    public void create(UUID userId, String title, String message, UserNotificationType type) {
        UserNotification notification = new UserNotification();
        userRepository.findById(userId).ifPresent(notification::setUser);
        notification.setTitle(title);
        notification.setMessage(message);
        notification.setType(type);
        userNotificationRepository.save(notification);
        log.debug("In-app notification created: userId={}, type={}", userId, type);
    }

    @Transactional(readOnly = true)
    public Page<UserNotificationResponse> getForUser(UUID userId, Pageable pageable) {
        return userNotificationRepository.findByUserIdOrderByCreatedAtDesc(userId, pageable)
                .map(this::toResponse);
    }

    /**
     * Cursor-paginated fetch for the backoffice notification feed (Impact 26).
     *
     * @param userId the requesting backoffice user
     * @param cursor opaque cursor from the previous page; null on first page
     * @param limit  rows to return (clamped to 1..50)
     * @param type   optional UserNotificationType filter; null means all types
     */
    @Transactional(readOnly = true)
    public CursorPagedResponse<UserNotificationResponse> getForUserWithCursor(
            UUID userId, String cursor, int limit, UserNotificationType type) {
        int clampedLimit = Math.min(Math.max(limit, 1), 50);

        // First-page case: substitute a far-future sentinel so the cursor
        // comparison is always satisfied AND the parameter is bound with a
        // concrete Postgres type (avoids "could not determine data type" on
        // the `:p IS NULL` style we used to have).
        OffsetDateTime cursorCreatedAt = OffsetDateTime.parse("9999-12-31T23:59:59.999999Z");
        UUID cursorId = new UUID(Long.MAX_VALUE, Long.MAX_VALUE);
        if (cursor != null && !cursor.isBlank()) {
            Decoded d = NotificationCursor.decode(cursor);
            cursorCreatedAt = d.createdAt();
            cursorId = d.id();
        }

        // Fetch limit+1 so we can detect "has more" without a separate count query.
        Pageable pageable = PageRequest.of(0, clampedLimit + 1);
        List<UserNotification> rows = (type == null)
                ? userNotificationRepository.findPageWithCursor(
                        userId, cursorCreatedAt, cursorId, pageable)
                : userNotificationRepository.findPageWithCursorByType(
                        userId, type, cursorCreatedAt, cursorId, pageable);

        boolean hasMore = rows.size() > clampedLimit;
        List<UserNotification> page = hasMore ? rows.subList(0, clampedLimit) : rows;

        String nextCursor = null;
        if (hasMore && !page.isEmpty()) {
            UserNotification last = page.get(page.size() - 1);
            nextCursor = NotificationCursor.encode(last.getCreatedAt(), last.getId());
        }

        return CursorPagedResponse.<UserNotificationResponse>builder()
                .items(page.stream().map(this::toResponse).toList())
                .nextCursor(nextCursor)
                .hasMore(hasMore)
                .build();
    }

    @Transactional(readOnly = true)
    public long getUnreadCount(UUID userId) {
        return userNotificationRepository.countByUserIdAndReadFalse(userId);
    }

    @Transactional
    public void markRead(UUID notificationId, UUID userId) {
        UserNotification n = userNotificationRepository.findById(notificationId)
                .orElseThrow(() -> new ResourceNotFoundException("Notification not found: " + notificationId));
        if (!n.getUser().getId().equals(userId)) {
            throw new ResourceNotFoundException("Notification not found: " + notificationId);
        }
        n.setRead(true);
        userNotificationRepository.save(n);
    }

    @Transactional
    public void markAllRead(UUID userId) {
        Page<UserNotification> unread = userNotificationRepository
                .findByUserIdAndReadFalseOrderByCreatedAtDesc(userId, Pageable.unpaged());
        unread.forEach(n -> n.setRead(true));
        userNotificationRepository.saveAll(unread.getContent());
    }

    private UserNotificationResponse toResponse(UserNotification n) {
        UserNotificationResponse resp = new UserNotificationResponse();
        resp.setId(n.getId());
        resp.setTitle(n.getTitle());
        resp.setMessage(n.getMessage());
        resp.setType(n.getType());
        resp.setRead(n.isRead());
        resp.setCreatedAt(n.getCreatedAt());
        return resp;
    }
}
