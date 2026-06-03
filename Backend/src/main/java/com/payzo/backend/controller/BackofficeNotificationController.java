package com.payzo.backend.controller;

import com.payzo.backend.domain.enums.UserNotificationType;
import com.payzo.backend.dto.response.common.ApiResponse;
import com.payzo.backend.dto.response.common.CursorPagedResponse;
import com.payzo.backend.dto.response.notification.UserNotificationResponse;
import com.payzo.backend.exception.ResourceNotFoundException;
import com.payzo.backend.repository.UserRepository;
import com.payzo.backend.security.SecurityUtils;
import com.payzo.backend.service.notification.InAppNotificationService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

/**
 * Backoffice-only cursor-paginated notification feed (BACKEND_IMPACTS.md Impact 26).
 *
 *   GET /api/v1/backoffice/notifications?cursor=&limit=&type=
 *
 * Use this for the bell-dropdown infinite scroll. Client app keeps using
 * /api/v1/notifications (offset-paginated) — different UX needs different shapes.
 */
@RestController
@RequestMapping("/api/v1/backoffice/notifications")
@RequiredArgsConstructor
public class BackofficeNotificationController {

    private final InAppNotificationService inAppNotificationService;
    private final SecurityUtils securityUtils;
    private final UserRepository userRepository;

    @GetMapping
    public ResponseEntity<ApiResponse<CursorPagedResponse<UserNotificationResponse>>> list(
            @RequestParam(required = false) String cursor,
            @RequestParam(defaultValue = "20") int limit,
            @RequestParam(required = false) UserNotificationType type) {
        UUID userId = resolveUserId();
        CursorPagedResponse<UserNotificationResponse> page =
                inAppNotificationService.getForUserWithCursor(userId, cursor, limit, type);
        return ResponseEntity.ok(ApiResponse.success("OK", page));
    }

    private UUID resolveUserId() {
        UUID keycloakId = securityUtils.getCurrentUserId();
        return userRepository.findByKeycloakId(keycloakId)
                .orElseThrow(() -> new ResourceNotFoundException("User not found"))
                .getId();
    }
}
