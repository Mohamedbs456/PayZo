package com.payzo.backend.controller;

import com.payzo.backend.dto.request.superadmin.BankLogoUpdateRequest;
import com.payzo.backend.dto.request.superadmin.CreateUserRequest;
import com.payzo.backend.dto.request.superadmin.ThresholdUpdateRequest;
import com.payzo.backend.dto.request.superadmin.UpdateUserRequest;
import com.payzo.backend.dto.response.admin.AuditLogResponse;
import com.payzo.backend.dto.response.analyst.ThresholdReportResponse;
import com.payzo.backend.dto.response.common.ApiResponse;
import com.payzo.backend.dto.response.common.PagedResponse;
import com.payzo.backend.dto.response.superadmin.BankResponse;
import com.payzo.backend.dto.response.superadmin.SuperAdminDashboardResponse;
import com.payzo.backend.dto.response.superadmin.UserResponse;
import com.payzo.backend.exception.ResourceNotFoundException;
import com.payzo.backend.mapper.UserMapper;
import com.payzo.backend.repository.AuditLogRepository;
import com.payzo.backend.repository.UserRepository;
import com.payzo.backend.security.SecurityUtils;
import com.payzo.backend.service.analyst.MlThresholdReportService;
import com.payzo.backend.service.superadmin.BankService;
import com.payzo.backend.service.superadmin.BankSyncService;
import com.payzo.backend.service.superadmin.MlConfigService;
import com.payzo.backend.service.superadmin.SuperAdminDashboardService;
import com.payzo.backend.service.superadmin.UserManagementService;
import jakarta.validation.Valid;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

/**
 * SuperAdmin-only API surface (D31): staff CRUD on admins and analysts,
 * cross-role block/unblock, ML threshold updates and reports, bank reference
 * data, and the system-wide audit feed (every actor, newest first). Per-role
 * history endpoints on AdminController and AnalystController stay scoped to
 * the calling user.
 */
@RestController
@RequestMapping("/api/v1/superadmin")
public class SuperAdminController {

    private final UserManagementService userManagementService;
    private final BankService bankService;
    private final BankSyncService bankSyncService;
    private final MlConfigService mlConfigService;
    private final MlThresholdReportService thresholdReportService;
    private final SuperAdminDashboardService superAdminDashboardService;
    private final SecurityUtils securityUtils;
    private final UserRepository userRepository;
    private final AuditLogRepository auditLogRepository;
    private final UserMapper userMapper;

    public SuperAdminController(UserManagementService userManagementService,
                                BankService bankService,
                                BankSyncService bankSyncService,
                                @Qualifier("superAdminMlConfigService") MlConfigService mlConfigService,
                                MlThresholdReportService thresholdReportService,
                                SuperAdminDashboardService superAdminDashboardService,
                                SecurityUtils securityUtils,
                                UserRepository userRepository,
                                AuditLogRepository auditLogRepository,
                                UserMapper userMapper) {
        this.userManagementService = userManagementService;
        this.bankService = bankService;
        this.bankSyncService = bankSyncService;
        this.mlConfigService = mlConfigService;
        this.thresholdReportService = thresholdReportService;
        this.superAdminDashboardService = superAdminDashboardService;
        this.securityUtils = securityUtils;
        this.userRepository = userRepository;
        this.auditLogRepository = auditLogRepository;
        this.userMapper = userMapper;
    }

    @GetMapping("/dashboard")
    public ResponseEntity<ApiResponse<SuperAdminDashboardResponse>> dashboard(
            @RequestParam(defaultValue = "30d") String period) {
        UUID superAdminId = resolveSuperAdminId();
        SuperAdminDashboardResponse stats = superAdminDashboardService.getStats(period, superAdminId);
        return ResponseEntity.ok(ApiResponse.success("OK", stats));
    }

    @GetMapping("/admins")
    public ResponseEntity<ApiResponse<PagedResponse<UserResponse>>> listAdmins(
            @RequestParam(required = false) String q,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        Page<UserResponse> result = userManagementService.getAdmins(q, clamp(page, size));
        return ResponseEntity.ok(ApiResponse.success("OK", toPagedResponse(result)));
    }

    @PostMapping("/admins")
    public ResponseEntity<ApiResponse<UserResponse>> createAdmin(
            @Valid @RequestBody CreateUserRequest request) {
        UserResponse user = userManagementService.createAdmin(request, resolveSuperAdminId());
        return ResponseEntity.ok(ApiResponse.success("Admin created", user));
    }

    @GetMapping("/admins/{id}")
    public ResponseEntity<ApiResponse<UserResponse>> getAdmin(@PathVariable UUID id) {
        UserResponse user = userManagementService.getAdmin(id);
        return ResponseEntity.ok(ApiResponse.success("OK", user));
    }

    @PutMapping("/admins/{id}")
    public ResponseEntity<ApiResponse<UserResponse>> updateAdmin(
            @PathVariable UUID id,
            @Valid @RequestBody UpdateUserRequest request) {
        UserResponse user = userManagementService.updateAdmin(id, request);
        return ResponseEntity.ok(ApiResponse.success("Admin updated", user));
    }

    @DeleteMapping("/admins/{id}")
    public ResponseEntity<ApiResponse<Void>> deleteAdmin(@PathVariable UUID id) {
        userManagementService.deleteAdmin(id, resolveSuperAdminId());
        return ResponseEntity.ok(ApiResponse.success("Admin deleted", null));
    }

    @GetMapping("/analysts")
    public ResponseEntity<ApiResponse<PagedResponse<UserResponse>>> listAnalysts(
            @RequestParam(required = false) String q,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        Page<UserResponse> result = userManagementService.getAnalysts(q, clamp(page, size));
        return ResponseEntity.ok(ApiResponse.success("OK", toPagedResponse(result)));
    }

    @PostMapping("/analysts")
    public ResponseEntity<ApiResponse<UserResponse>> createAnalyst(
            @Valid @RequestBody CreateUserRequest request) {
        UserResponse user = userManagementService.createAnalyst(request, resolveSuperAdminId());
        return ResponseEntity.ok(ApiResponse.success("Analyst created", user));
    }

    @GetMapping("/analysts/{id}")
    public ResponseEntity<ApiResponse<UserResponse>> getAnalyst(@PathVariable UUID id) {
        UserResponse user = userManagementService.getAnalyst(id);
        return ResponseEntity.ok(ApiResponse.success("OK", user));
    }

    @PutMapping("/analysts/{id}")
    public ResponseEntity<ApiResponse<UserResponse>> updateAnalyst(
            @PathVariable UUID id,
            @Valid @RequestBody UpdateUserRequest request) {
        UserResponse user = userManagementService.updateAnalyst(id, request);
        return ResponseEntity.ok(ApiResponse.success("Analyst updated", user));
    }

    @DeleteMapping("/analysts/{id}")
    public ResponseEntity<ApiResponse<Void>> deleteAnalyst(@PathVariable UUID id) {
        userManagementService.deleteAnalyst(id, resolveSuperAdminId());
        return ResponseEntity.ok(ApiResponse.success("Analyst deleted", null));
    }

    @PutMapping("/users/{userId}/block")
    public ResponseEntity<ApiResponse<Void>> blockUser(@PathVariable UUID userId) {
        userManagementService.blockUser(userId, resolveSuperAdminId());
        return ResponseEntity.ok(ApiResponse.success("User blocked", null));
    }

    @PutMapping("/users/{userId}/unblock")
    public ResponseEntity<ApiResponse<Void>> unblockUser(@PathVariable UUID userId) {
        userManagementService.unblockUser(userId, resolveSuperAdminId());
        return ResponseEntity.ok(ApiResponse.success("User unblocked", null));
    }

    @PutMapping("/ml-threshold")
    public ResponseEntity<ApiResponse<Void>> updateThresholds(
            @Valid @RequestBody ThresholdUpdateRequest request) {
        mlConfigService.updateThresholds(
                request.getThresholdLowMedium(),
                request.getThresholdMediumHigh(),
                resolveSuperAdminId());
        return ResponseEntity.ok(ApiResponse.success("Thresholds updated", null));
    }

    @GetMapping("/ml/threshold-reports")
    public ResponseEntity<ApiResponse<PagedResponse<ThresholdReportResponse>>> listThresholdReports(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        Page<ThresholdReportResponse> result = thresholdReportService.getAllReports(clamp(page, size));
        return ResponseEntity.ok(ApiResponse.success("OK", toPagedResponse(result)));
    }

    @PutMapping("/ml/threshold-reports/{id}/read")
    public ResponseEntity<ApiResponse<ThresholdReportResponse>> markReportRead(@PathVariable UUID id) {
        ThresholdReportResponse report = thresholdReportService.markAsRead(id);
        return ResponseEntity.ok(ApiResponse.success("Report marked as read", report));
    }

    @GetMapping("/banks")
    public ResponseEntity<ApiResponse<PagedResponse<BankResponse>>> listBanks(
            @RequestParam(required = false) String q,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        Page<BankResponse> result = bankService.getAllBanks(q, clamp(page, size));
        return ResponseEntity.ok(ApiResponse.success("OK", toPagedResponse(result)));
    }

    /**
     * Pull-from-CBS sync — inserts new banks (defaulting to inactive), refreshes
     * names + numeric codes, force-deactivates banks missing from CBS. Idempotent.
     */
    @PostMapping("/banks/sync")
    public ResponseEntity<ApiResponse<BankSyncService.SyncResult>> syncBanks() {
        BankSyncService.SyncResult result = bankSyncService.syncFromCbs();
        return ResponseEntity.ok(ApiResponse.success("Bank catalog synced from CBS", result));
    }

    @PutMapping("/banks/{id}/logo")
    public ResponseEntity<ApiResponse<BankResponse>> updateBankLogo(
            @PathVariable UUID id,
            @Valid @RequestBody BankLogoUpdateRequest request) {
        BankResponse bank = bankService.updateBankLogo(id, request.getLogoUrl(), resolveSuperAdminId());
        return ResponseEntity.ok(ApiResponse.success("Bank logo updated", bank));
    }

    @PutMapping("/banks/{id}/deactivate")
    public ResponseEntity<ApiResponse<Void>> deactivateBank(@PathVariable UUID id) {
        bankService.deactivateBank(id, resolveSuperAdminId());
        return ResponseEntity.ok(ApiResponse.success("Bank deactivated", null));
    }

    @PutMapping("/banks/{id}/activate")
    public ResponseEntity<ApiResponse<Void>> activateBank(@PathVariable UUID id) {
        bankService.activateBank(id, resolveSuperAdminId());
        return ResponseEntity.ok(ApiResponse.success("Bank activated", null));
    }

    /**
     * SuperAdmin audit feed — every row in {@code audit_logs} regardless of
     * actor. Newest first. Per-actor history endpoints
     * ({@code /admin/decisions/history}, {@code /analyst/decisions/history})
     * still scope to the calling user; this one is the SA-only system view.
     */
    @GetMapping("/audit-log")
    public ResponseEntity<ApiResponse<PagedResponse<AuditLogResponse>>> auditLog(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        int safeSize = Math.min(Math.max(size, 1), 100);
        int safePage = Math.max(page, 0);
        Pageable pageable = PageRequest.of(safePage, safeSize,
                Sort.by(Sort.Direction.DESC, "createdAt"));
        Page<AuditLogResponse> result = auditLogRepository.findAll(pageable)
                .map(userMapper::toAuditLogResponse);
        return ResponseEntity.ok(ApiResponse.success("OK", toPagedResponse(result)));
    }

    private UUID resolveSuperAdminId() {
        UUID keycloakId = securityUtils.getCurrentUserId();
        return userRepository.findByKeycloakId(keycloakId)
                .orElseThrow(() -> new ResourceNotFoundException("SuperAdmin not found"))
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
