package com.payzo.backend.controller;

import com.payzo.backend.domain.enums.UserStatus;
import com.payzo.backend.dto.request.admin.DirectSubscriptionRequest;
import com.payzo.backend.dto.request.admin.SubscriptionDecisionRequest;
import com.payzo.backend.dto.response.admin.AdminDashboardResponse;
import com.payzo.backend.dto.response.admin.AuditLogResponse;
import com.payzo.backend.dto.response.admin.CbsAccountResponse;
import com.payzo.backend.dto.response.admin.CbsClientPreviewResponse;
import com.payzo.backend.dto.response.admin.ClientCbsSummaryResponse;
import com.payzo.backend.dto.response.admin.SubscriptionResponse;
import com.payzo.backend.dto.response.common.ApiResponse;
import com.payzo.backend.dto.response.common.PagedResponse;
import com.payzo.backend.exception.ResourceNotFoundException;
import com.payzo.backend.repository.UserRepository;
import com.payzo.backend.security.SecurityUtils;
import com.payzo.backend.service.admin.AdminDashboardService;
import com.payzo.backend.service.admin.SubscriptionService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

/**
 * Admin API surface: subscription review (approve / reject / direct-register),
 * client CIN preview against CBS, transactions list scoped to read-only (D32),
 * and the admin's per-actor decision history. Role gate ROLE_ADMIN or
 * ROLE_SUPERADMIN via SecurityConfig.
 */
@RestController
@RequestMapping("/api/v1/admin")
@RequiredArgsConstructor
public class AdminController {

    private final SubscriptionService subscriptionService;
    private final AdminDashboardService adminDashboardService;
    private final SecurityUtils securityUtils;
    private final UserRepository userRepository;

    @GetMapping("/dashboard/stats")
    public ResponseEntity<ApiResponse<AdminDashboardResponse>> dashboardStats(
            @RequestParam(defaultValue = "30d") String period) {
        UUID adminId = resolveAdminId();
        AdminDashboardResponse stats = adminDashboardService.getStats(period, adminId);
        return ResponseEntity.ok(ApiResponse.success("OK", stats));
    }

    @GetMapping("/subscriptions")
    public ResponseEntity<ApiResponse<PagedResponse<SubscriptionResponse>>> listPending(
            @RequestParam(required = false) String q,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        Page<SubscriptionResponse> result = subscriptionService
                .getPendingSubscriptions(q, clamp(page, size));
        return ResponseEntity.ok(ApiResponse.success("OK", toPagedResponse(result)));
    }

    @GetMapping("/subscriptions/{userId}")
    public ResponseEntity<ApiResponse<SubscriptionResponse>> subscriptionDetail(
            @PathVariable UUID userId) {
        SubscriptionResponse detail = subscriptionService.getSubscriptionDetail(userId);
        return ResponseEntity.ok(ApiResponse.success("OK", detail));
    }

    @PostMapping("/subscriptions/{userId}/approve")
    public ResponseEntity<ApiResponse<Void>> approve(@PathVariable UUID userId) {
        subscriptionService.approveSubscription(userId, resolveAdminId());
        return ResponseEntity.ok(ApiResponse.success("Subscription approved", null));
    }

    @PostMapping("/subscriptions/{userId}/reject")
    public ResponseEntity<ApiResponse<Void>> reject(
            @PathVariable UUID userId,
            @RequestBody(required = false) SubscriptionDecisionRequest request) {
        String reason = request != null ? request.getReason() : null;
        subscriptionService.rejectSubscription(userId, reason, resolveAdminId());
        return ResponseEntity.ok(ApiResponse.success("Subscription rejected", null));
    }

    @PostMapping("/subscriptions/direct")
    public ResponseEntity<ApiResponse<Void>> directSubscribe(
            @Valid @RequestBody DirectSubscriptionRequest request) {
        subscriptionService.directSubscribe(request.getCin(), resolveAdminId());
        return ResponseEntity.ok(ApiResponse.success("Client subscribed directly", null));
    }

    /**
     * Preview a CBS client by CIN before direct subscription. Returns the CBS
     * identity (name / contact / DOB / address) plus an `alreadyRegistered`
     * flag so the FE Register-client dialog can render an inline preview.
     */
    @GetMapping("/cbs/clients/{cin}")
    public ResponseEntity<ApiResponse<CbsClientPreviewResponse>> previewCbsClient(
            @PathVariable String cin) {
        return ResponseEntity.ok(ApiResponse.success("OK",
                subscriptionService.previewCbsClient(cin)));
    }

    @GetMapping("/clients")
    public ResponseEntity<ApiResponse<PagedResponse<SubscriptionResponse>>> listClients(
            @RequestParam(required = false) UserStatus status,
            @RequestParam(required = false) String q,
            @RequestParam(required = false) String bank,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        Page<SubscriptionResponse> result = (bank != null && !bank.isBlank())
                ? subscriptionService.getClientsByBank(bank, status, q, clamp(page, size))
                : subscriptionService.getClients(status, q, clamp(page, size));
        return ResponseEntity.ok(ApiResponse.success("OK", toPagedResponse(result)));
    }

    @GetMapping("/clients/{userId}/cbs-summary")
    public ResponseEntity<ApiResponse<ClientCbsSummaryResponse>> clientCbsSummary(
            @PathVariable UUID userId) {
        return ResponseEntity.ok(ApiResponse.success("OK",
                subscriptionService.getCbsSummary(userId)));
    }

    /**
     * Per-account CBS detail for a single client — drives the Accounts-page
     * expanded row (each account = one row inside the panel).
     */
    @GetMapping("/clients/{userId}/cbs-accounts")
    public ResponseEntity<ApiResponse<java.util.List<CbsAccountResponse>>> clientCbsAccounts(
            @PathVariable UUID userId) {
        return ResponseEntity.ok(ApiResponse.success("OK",
                subscriptionService.getCbsAccounts(userId)));
    }

    @PutMapping("/clients/{userId}/block")
    public ResponseEntity<ApiResponse<Void>> blockClient(@PathVariable UUID userId) {
        subscriptionService.blockClient(userId, resolveAdminId());
        return ResponseEntity.ok(ApiResponse.success("Client blocked", null));
    }

    @PutMapping("/clients/{userId}/unblock")
    public ResponseEntity<ApiResponse<Void>> unblockClient(@PathVariable UUID userId) {
        subscriptionService.unblockClient(userId, resolveAdminId());
        return ResponseEntity.ok(ApiResponse.success("Client unblocked", null));
    }

    @DeleteMapping("/clients/{userId}")
    public ResponseEntity<ApiResponse<Void>> deleteClient(@PathVariable UUID userId) {
        subscriptionService.deleteClient(userId, resolveAdminId());
        return ResponseEntity.ok(ApiResponse.success("Client deleted", null));
    }

    @GetMapping("/decisions/history")
    public ResponseEntity<ApiResponse<PagedResponse<AuditLogResponse>>> decisionHistory(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        UUID adminId = resolveAdminId();
        Page<AuditLogResponse> result = subscriptionService
                .getDecisionHistory(adminId, clamp(page, size));
        return ResponseEntity.ok(ApiResponse.success("OK", toPagedResponse(result)));
    }

    private UUID resolveAdminId() {
        UUID keycloakId = securityUtils.getCurrentUserId();
        return userRepository.findByKeycloakId(keycloakId)
                .orElseThrow(() -> new ResourceNotFoundException("Admin not found"))
                .getId();
    }

    private Pageable clamp(int page, int size) {
        // Newest-first ordering for every paged admin list (clients, pending
        // subscriptions, decision history). Per the Clients-page spec all rows
        // on every tab are sorted by date+time with newer on top.
        return PageRequest.of(
                page,
                Math.min(Math.max(size, 1), 100),
                Sort.by(Sort.Direction.DESC, "createdAt"));
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
