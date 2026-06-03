package com.payzo.backend.controller;

import com.payzo.backend.domain.enums.AlertStatus;
import com.payzo.backend.domain.enums.AmountBand;
import com.payzo.backend.domain.enums.RiskLevel;
import com.payzo.backend.dto.request.analyst.AlertDecisionRequest;
import com.payzo.backend.dto.response.analyst.FraudAlertResponse;
import com.payzo.backend.dto.response.common.ApiResponse;
import com.payzo.backend.dto.response.common.PagedResponse;
import com.payzo.backend.exception.ResourceNotFoundException;
import com.payzo.backend.repository.UserRepository;
import com.payzo.backend.security.SecurityUtils;
import com.payzo.backend.service.analyst.AlertService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

/**
 * Resource-oriented fraud-alerts API. Endpoint paths and verbs follow
 * BACKEND_IMPACTS.md Impact 8e:
 *
 *   GET    /api/v1/fraud-alerts                       — paged list with full filters
 *   GET    /api/v1/fraud-alerts/{id}                  — detail
 *   PATCH  /api/v1/fraud-alerts/{id}/approve          — analyst marks NOT fraud (CBS executes)
 *   PATCH  /api/v1/fraud-alerts/{id}/reject           — analyst confirms fraud (transfer killed)
 *   DELETE /api/v1/fraud-alerts/{id}/cancel-pending   — SuperAdmin override on a stuck alert
 *
 * Routes are gated by SecurityConfig: list/detail/approve/reject for ANALYST + SUPERADMIN,
 * cancel-pending for SUPERADMIN only.
 */
@RestController
@RequestMapping("/api/v1/fraud-alerts")
@RequiredArgsConstructor
public class FraudAlertController {

    private final AlertService alertService;
    private final SecurityUtils securityUtils;
    private final UserRepository userRepository;

    @GetMapping
    public ResponseEntity<ApiResponse<PagedResponse<FraudAlertResponse>>> listAlerts(
            @RequestParam(required = false) AlertStatus status,
            @RequestParam(required = false) RiskLevel risk,
            @RequestParam(required = false) String bankCode,
            @RequestParam(required = false) AmountBand amount,
            @RequestParam(required = false) String period,
            @RequestParam(required = false) String q,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        Page<FraudAlertResponse> result = alertService.getAlerts(
                status, risk, bankCode, amount, period, q, clamp(page, size));
        return ResponseEntity.ok(ApiResponse.success("OK", toPagedResponse(result)));
    }

    @GetMapping("/{alertId}")
    public ResponseEntity<ApiResponse<FraudAlertResponse>> alertDetail(
            @PathVariable UUID alertId) {
        FraudAlertResponse detail = alertService.getAlertDetail(alertId);
        return ResponseEntity.ok(ApiResponse.success("OK", detail));
    }

    @PatchMapping("/{alertId}/approve")
    public ResponseEntity<ApiResponse<Void>> approve(
            @PathVariable UUID alertId,
            @Valid @RequestBody(required = false) AlertDecisionRequest request) {
        String comment = request != null ? request.getComment() : null;
        alertService.approveAlert(alertId, comment, resolveActorId());
        return ResponseEntity.ok(ApiResponse.success("Alert approved — transfer executed", null));
    }

    @PatchMapping("/{alertId}/reject")
    public ResponseEntity<ApiResponse<Void>> reject(
            @PathVariable UUID alertId,
            @Valid @RequestBody AlertDecisionRequest request) {
        alertService.rejectAlert(alertId, request.getComment(), resolveActorId());
        return ResponseEntity.ok(ApiResponse.success("Alert rejected — transfer cancelled", null));
    }

    @DeleteMapping("/{alertId}/cancel-pending")
    public ResponseEntity<ApiResponse<Void>> cancelPending(
            @PathVariable UUID alertId,
            @RequestParam(required = false) String reason) {
        alertService.cancelPending(alertId, resolveActorId(), reason);
        return ResponseEntity.ok(ApiResponse.success("Alert cancelled", null));
    }

    private UUID resolveActorId() {
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
