package com.payzo.backend.controller;

import com.payzo.backend.dto.request.analyst.ThresholdReportRequest;
import com.payzo.backend.dto.response.admin.AuditLogResponse;
import com.payzo.backend.dto.response.analyst.*;
import com.payzo.backend.dto.response.common.ApiResponse;
import com.payzo.backend.dto.response.common.PagedResponse;
import com.payzo.backend.exception.ResourceNotFoundException;
import com.payzo.backend.repository.UserRepository;
import com.payzo.backend.security.SecurityUtils;
import com.payzo.backend.service.analyst.AlertService;
import com.payzo.backend.service.analyst.AnalystDashboardService;
import com.payzo.backend.service.analyst.MlConfigService;
import com.payzo.backend.service.analyst.MlThresholdReportService;
import jakarta.validation.Valid;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

/**
 * Analyst API surface: fraud-alert queue with approve / reject decisions (D33),
 * ML threshold proposals routed to the SuperAdmin for sign-off, and the analyst's
 * per-actor decision history. Threshold reads come from analystMlConfigService;
 * writes go through the SuperAdmin bean (Qualifier prevents the SA bean from
 * being injected here by accident).
 */
@RestController
@RequestMapping("/api/v1/analyst")
public class AnalystController {

    private final AlertService alertService;
    private final AnalystDashboardService analystDashboardService;
    private final MlConfigService mlConfigService;
    private final MlThresholdReportService thresholdReportService;
    private final SecurityUtils securityUtils;
    private final UserRepository userRepository;

    public AnalystController(AlertService alertService,
                             AnalystDashboardService analystDashboardService,
                             @Qualifier("analystMlConfigService") MlConfigService mlConfigService,
                             MlThresholdReportService thresholdReportService,
                             SecurityUtils securityUtils,
                             UserRepository userRepository) {
        this.alertService = alertService;
        this.analystDashboardService = analystDashboardService;
        this.mlConfigService = mlConfigService;
        this.thresholdReportService = thresholdReportService;
        this.securityUtils = securityUtils;
        this.userRepository = userRepository;
    }

    @GetMapping("/dashboard")
    public ResponseEntity<ApiResponse<AnalystDashboardResponse>> dashboard(
            @RequestParam(defaultValue = "30d") String period) {
        AnalystDashboardResponse stats = analystDashboardService.getStats(period);
        return ResponseEntity.ok(ApiResponse.success("OK", stats));
    }

    @GetMapping("/decisions/history")
    public ResponseEntity<ApiResponse<PagedResponse<AuditLogResponse>>> decisionHistory(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        UUID analystId = resolveAnalystId();
        Page<AuditLogResponse> result = alertService
                .getDecisionHistory(analystId, clamp(page, size));
        return ResponseEntity.ok(ApiResponse.success("OK", toPagedResponse(result)));
    }

    @GetMapping("/statistics")
    public ResponseEntity<ApiResponse<StatisticsResponse>> statistics(
            @RequestParam(defaultValue = "30d") String period) {
        AnalystDashboardResponse dashboard = analystDashboardService.getStats(period);
        StatisticsResponse stats = StatisticsResponse.builder()
                .totalTransactions(dashboard.getKpis().getTotalTransactionCount())
                .fraudAlerts(dashboard.getKpis().getPendingAlerts())
                .fraudRate(dashboard.getKpis().getFraudConfirmedRate())
                .totalVolume(dashboard.getKpis().getTotalTransactionVolume())
                .riskLevelDistribution(dashboard.getRiskLevelDistribution())
                .alertStatusDistribution(dashboard.getAlertStatusDistribution())
                .transactionsByHour(dashboard.getTransactionsByHour())
                .build();
        return ResponseEntity.ok(ApiResponse.success("OK", stats));
    }

    @GetMapping("/ml-metrics")
    public ResponseEntity<ApiResponse<MlMetricsResponse>> mlMetrics() {
        MlMetricsResponse metrics = mlConfigService.getMetrics();
        return ResponseEntity.ok(ApiResponse.success("OK", metrics));
    }

    @GetMapping("/ml-config")
    public ResponseEntity<ApiResponse<MlConfigResponse>> mlConfig() {
        MlConfigResponse config = mlConfigService.getThresholds();
        return ResponseEntity.ok(ApiResponse.success("OK", config));
    }

    @PostMapping("/ml/threshold-reports")
    public ResponseEntity<ApiResponse<ThresholdReportResponse>> submitThresholdReport(
            @Valid @RequestBody ThresholdReportRequest request) {
        ThresholdReportResponse report = thresholdReportService.submitReport(resolveAnalystId(), request);
        return ResponseEntity.ok(ApiResponse.success("Threshold report submitted", report));
    }

    private UUID resolveAnalystId() {
        UUID keycloakId = securityUtils.getCurrentUserId();
        return userRepository.findByKeycloakId(keycloakId)
                .orElseThrow(() -> new ResourceNotFoundException("Analyst not found"))
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
