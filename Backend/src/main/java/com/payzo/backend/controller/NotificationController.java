package com.payzo.backend.controller;

import com.payzo.backend.dto.response.common.ApiResponse;
import com.payzo.backend.dto.response.common.PagedResponse;
import com.payzo.backend.dto.response.notification.UserNotificationResponse;
import com.payzo.backend.exception.ResourceNotFoundException;
import com.payzo.backend.repository.UserRepository;
import com.payzo.backend.security.SecurityUtils;
import com.payzo.backend.service.notification.InAppNotificationService;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;
import java.util.UUID;

/** Client bell-dropdown feed under {@code /api/v1/notifications}, scoped per-user via the JWT {@code sub} claim. */
@RestController
@RequestMapping("/api/v1/notifications")
@RequiredArgsConstructor
public class NotificationController {

    private final InAppNotificationService inAppNotificationService;
    private final SecurityUtils securityUtils;
    private final UserRepository userRepository;

    @GetMapping
    public ResponseEntity<ApiResponse<PagedResponse<UserNotificationResponse>>> list(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        UUID userId = resolveUserId();
        Page<UserNotificationResponse> result = inAppNotificationService
                .getForUser(userId, clamp(page, size));
        return ResponseEntity.ok(ApiResponse.success("OK", toPagedResponse(result)));
    }

    @GetMapping("/unread-count")
    public ResponseEntity<ApiResponse<Map<String, Long>>> unreadCount() {
        UUID userId = resolveUserId();
        long count = inAppNotificationService.getUnreadCount(userId);
        return ResponseEntity.ok(ApiResponse.success("OK", Map.of("count", count)));
    }

    @PutMapping("/{id}/read")
    public ResponseEntity<ApiResponse<Void>> markRead(@PathVariable UUID id) {
        UUID userId = resolveUserId();
        inAppNotificationService.markRead(id, userId);
        return ResponseEntity.ok(ApiResponse.success("Marked as read", null));
    }

    @PutMapping("/read-all")
    public ResponseEntity<ApiResponse<Void>> markAllRead() {
        UUID userId = resolveUserId();
        inAppNotificationService.markAllRead(userId);
        return ResponseEntity.ok(ApiResponse.success("All marked as read", null));
    }

    private UUID resolveUserId() {
        UUID keycloakId = securityUtils.getCurrentUserId();
        return userRepository.findByKeycloakId(keycloakId)
                .orElseThrow(() -> new ResourceNotFoundException("User not found"))
                .getId();
    }

    private Pageable clamp(int page, int size) {
        return PageRequest.of(page, Math.min(Math.max(size, 1), 100));
    }

    private <T> PagedResponse<T> toPagedResponse(Page<T> page) {
        return PagedResponse.<T>builder()
                .content(page.getContent())
                .page(page.getNumber())
                .size(page.getSize())
                .totalElements(page.getTotalElements())
                .totalPages(page.getTotalPages())
                .build();
    }
}
