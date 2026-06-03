package com.payzo.backend.controller;

import com.payzo.backend.domain.entity.Client;
import com.payzo.backend.domain.enums.AlertStatus;
import com.payzo.backend.domain.enums.RiskLevel;
import com.payzo.backend.domain.enums.TransactionStatus;
import com.payzo.backend.dto.request.client.BeneficiaryCreateRequest;
import com.payzo.backend.dto.request.client.BeneficiaryNicknameUpdateRequest;
import com.payzo.backend.dto.request.client.InternalTransferRequest;
import com.payzo.backend.dto.request.client.SetDefaultAccountRequest;
import com.payzo.backend.dto.request.client.TransferOtpConfirmRequest;
import com.payzo.backend.dto.request.client.TransferRequest;
import com.payzo.backend.dto.request.client.UsernameChangeRequest;
import com.payzo.backend.dto.response.client.*;
import com.payzo.backend.dto.response.common.ApiResponse;
import com.payzo.backend.dto.response.common.PagedResponse;
import com.payzo.backend.exception.ResourceNotFoundException;
import com.payzo.backend.repository.UserRepository;
import com.payzo.backend.security.SecurityUtils;
import com.payzo.backend.service.client.BeneficiaryService;
import com.payzo.backend.service.client.ClientService;
import com.payzo.backend.service.client.TransferService;
import com.payzo.backend.util.ClientAlertStatusMapper;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Client-facing API surface (ROLE_CLIENT, clients realm). Owns profile, accounts,
 * transfers (full pipeline kicks off in TransferService), beneficiaries, default-destination,
 * and the client's view of fraud-alerts on their own transactions. Identity fields
 * (email, phone, governorate) are fetched live from CBS via ClientProfileService so
 * the staff-vs-client identity is never duplicated on the PayZo User row.
 */
@RestController
@RequestMapping("/api/v1/client")
@RequiredArgsConstructor
public class ClientController {

    private final ClientService clientService;
    private final TransferService transferService;
    private final BeneficiaryService beneficiaryService;
    private final SecurityUtils securityUtils;
    private final UserRepository userRepository;

    @GetMapping("/profile")
    public ResponseEntity<ApiResponse<ProfileResponse>> getProfile() {
        UUID clientId = resolveClientId();
        ProfileResponse profile = clientService.getProfile(clientId);
        return ResponseEntity.ok(ApiResponse.success("OK", profile));
    }

    @PutMapping(value = "/profile/picture", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<ApiResponse<Map<String, String>>> updateProfilePicture(
            @RequestParam("file") MultipartFile file) {
        UUID clientId = resolveClientId();
        String url = clientService.updateProfilePicture(clientId, file);
        return ResponseEntity.ok(ApiResponse.success("Profile picture updated",
                Map.of("profilePictureUrl", url)));
    }

    /**
     * Set / change the client's default destination account for incoming
     * P2P transfers. The body's account number must belong to this
     * client (CBS lookup) — otherwise we 404 to avoid leaking which
     * account numbers exist. Drives the ★ marker on the accounts page
     * and the {@code useDefaultAccount=true} branch of the send-money
     * recipient resolver.
     */
    @PatchMapping("/profile/default-account")
    public ResponseEntity<ApiResponse<Map<String, String>>> setDefaultAccount(
            @Valid @RequestBody SetDefaultAccountRequest request) {
        UUID clientId = resolveClientId();
        String saved = clientService.setDefaultAccount(clientId, request.getAccountNumber());
        return ResponseEntity.ok(ApiResponse.success("Default account updated",
                Map.of("defaultAccountId", saved)));
    }

    /**
     * Edit the client's mutable {@code @username} (D54). Auto-generated as
     * {@code firstname.lastname} at registration; clients can rebrand later
     * (e.g. a coffee-shop owner takes {@code @coffee.forever} so customers
     * can pay them by username).
     *
     * <p>Error codes: 422 {@code USERNAME_INVALID} (format), 409
     * {@code USERNAME_TAKEN} / {@code USERNAME_RESERVED}. Idempotent on
     * the same-value path: returns 200 + the existing profile without
     * writing the row.
     */
    @PatchMapping("/profile/username")
    public ResponseEntity<ApiResponse<ProfileResponse>> updateUsername(
            @Valid @RequestBody UsernameChangeRequest request) {
        UUID clientId = resolveClientId();
        ProfileResponse updated = clientService.updateUsername(clientId, request.getUsername());
        return ResponseEntity.ok(ApiResponse.success("Username updated", updated));
    }

    @GetMapping("/accounts")
    public ResponseEntity<ApiResponse<List<AccountResponse>>> getAccounts() {
        UUID clientId = resolveClientId();
        List<AccountResponse> accounts = clientService.getAccounts(clientId);
        return ResponseEntity.ok(ApiResponse.success("OK", accounts));
    }

    @GetMapping("/accounts/{accountNum}/transactions")
    public ResponseEntity<ApiResponse<PagedResponse<TransactionResponse>>> getAccountTransactions(
            @PathVariable String accountNum,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        Page<TransactionResponse> result = clientService
                .getAccountTransactions(accountNum, clamp(page, size));
        return ResponseEntity.ok(ApiResponse.success("OK", toPagedResponse(result)));
    }

    @GetMapping("/transactions")
    public ResponseEntity<ApiResponse<PagedResponse<TransactionResponse>>> listTransactions(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false) String type,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String bank,
            @RequestParam(required = false) String period,
            @RequestParam(required = false) String origin,
            @RequestParam(required = false) String account,
            @RequestParam(required = false) String q) {
        UUID clientId = resolveClientId();
        TransactionStatus statusEnum = parseTxStatus(status);
        int safeSize = Math.min(Math.max(size, 1), 100);
        int safePage = Math.max(page, 0);
        PagedResponse<TransactionResponse> result = clientService.listMergedTransactions(
                clientId, type, statusEnum, bank, period, origin, account, q, safePage, safeSize);
        return ResponseEntity.ok(ApiResponse.success("OK", result));
    }

    private TransactionStatus parseTxStatus(String s) {
        if (s == null || s.isBlank() || "ALL".equalsIgnoreCase(s)) return null;
        return switch (s.toUpperCase()) {
            case "PENDING", "PENDING_OTP" -> TransactionStatus.PENDING_OTP;
            case "PENDING_SCORING" -> TransactionStatus.PENDING_SCORING;
            case "SUSPENDED", "SUSPENDED_PENDING_ANALYST" -> TransactionStatus.SUSPENDED_PENDING_ANALYST;
            case "APPROVED" -> TransactionStatus.APPROVED;
            case "REJECTED" -> TransactionStatus.REJECTED;
            default -> null;
        };
    }

    @PostMapping("/transfers")
    public ResponseEntity<ApiResponse<Map<String, UUID>>> initiateTransfer(
            @Valid @RequestBody TransferRequest request) {
        UUID clientId = resolveClientId();
        UUID transactionId = transferService.initiateTransfer(clientId, request);
        return ResponseEntity.ok(ApiResponse.success("OTP sent",
                Map.of("transactionId", transactionId)));
    }

    @PostMapping("/transfers/internal")
    public ResponseEntity<ApiResponse<InternalTransferResponse>> internalTransfer(
            @Valid @RequestBody InternalTransferRequest request) {
        UUID clientId = resolveClientId();
        InternalTransferResponse result = transferService.executeInternal(clientId, request);
        return ResponseEntity.ok(ApiResponse.success("Internal transfer completed", result));
    }

    @PostMapping("/transfers/{id}/confirm-otp")
    public ResponseEntity<ApiResponse<Void>> confirmTransferOtp(
            @PathVariable UUID id,
            @Valid @RequestBody TransferOtpConfirmRequest request) {
        UUID clientId = resolveClientId();
        transferService.confirmTransfer(id, request.getOtpCode(), clientId);
        return ResponseEntity.ok(ApiResponse.success("Transfer processed", null));
    }

    /**
     * Re-issue the OTP for a PENDING_OTP transfer. Frontend "Send a new code"
     * affordance on the OTP step calls this. OtpService enforces the 60s
     * rate-limit and returns 429-style errors if the user clicks too fast.
     */
    @PostMapping("/transfers/{id}/resend-otp")
    public ResponseEntity<ApiResponse<Void>> resendTransferOtp(@PathVariable UUID id) {
        UUID clientId = resolveClientId();
        transferService.resendTransferOtp(id, clientId);
        return ResponseEntity.ok(ApiResponse.success("OTP resent", null));
    }

    @GetMapping("/transfers/{id}")
    public ResponseEntity<ApiResponse<TransactionResponse>> getTransferDetail(
            @PathVariable UUID id) {
        UUID clientId = resolveClientId();
        TransactionResponse detail = clientService.getTransferDetail(id, clientId);
        return ResponseEntity.ok(ApiResponse.success("OK", detail));
    }

    @GetMapping("/alerts/summary")
    public ResponseEntity<ApiResponse<ClientAlertSummary>> getAlertSummary() {
        UUID clientId = resolveClientId();
        ClientAlertSummary summary = clientService.getAlertSummary(clientId);
        return ResponseEntity.ok(ApiResponse.success("OK", summary));
    }

    @DeleteMapping("/alerts/{alertId}/cancel-pending")
    public ResponseEntity<ApiResponse<Void>> cancelPendingAlert(
            @PathVariable UUID alertId,
            @RequestParam(required = false) String reason) {
        UUID clientId = resolveClientId();
        clientService.cancelOwnAlert(clientId, alertId, reason);
        return ResponseEntity.ok(ApiResponse.success("Alert cancelled", null));
    }

    @GetMapping("/alerts")
    public ResponseEntity<ApiResponse<PagedResponse<AlertResponse>>> getAlerts(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String risk,
            @RequestParam(required = false) String bank,
            @RequestParam(required = false) String period,
            @RequestParam(required = false) String q) {
        UUID clientId = resolveClientId();
        AlertStatus statusEnum = ClientAlertStatusMapper.fromClient(status);
        RiskLevel riskEnum = parseRisk(risk);
        Page<AlertResponse> result = clientService.getAlerts(
                clientId, statusEnum, riskEnum, bank, period, q, clamp(page, size));
        return ResponseEntity.ok(ApiResponse.success("OK", toPagedResponse(result)));
    }

    private RiskLevel parseRisk(String risk) {
        if (risk == null || risk.isBlank() || "ALL".equalsIgnoreCase(risk)) return null;
        return switch (risk.toUpperCase()) {
            case "MED", "MEDIUM" -> RiskLevel.MEDIUM;
            case "LOW" -> RiskLevel.LOW;
            case "HIGH" -> RiskLevel.HIGH;
            default -> null;
        };
    }

    @GetMapping("/beneficiaries")
    public ResponseEntity<ApiResponse<PagedResponse<BeneficiaryResponse>>> getBeneficiaries(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        UUID clientId = resolveClientId();
        Page<BeneficiaryResponse> result = beneficiaryService.list(clientId, clamp(page, size));
        return ResponseEntity.ok(ApiResponse.success("OK", toPagedResponse(result)));
    }

    @PostMapping("/beneficiaries")
    public ResponseEntity<ApiResponse<BeneficiaryResponse>> createBeneficiary(
            @Valid @RequestBody BeneficiaryCreateRequest request) {
        UUID clientId = resolveClientId();
        BeneficiaryResponse b = beneficiaryService.create(clientId, request);
        return ResponseEntity.ok(ApiResponse.success("Beneficiary saved", b));
    }

    @PatchMapping("/beneficiaries/{id}")
    public ResponseEntity<ApiResponse<BeneficiaryResponse>> updateBeneficiaryNickname(
            @PathVariable UUID id,
            @Valid @RequestBody BeneficiaryNicknameUpdateRequest request) {
        UUID clientId = resolveClientId();
        BeneficiaryResponse b = beneficiaryService.updateNickname(clientId, id, request);
        return ResponseEntity.ok(ApiResponse.success("Nickname updated", b));
    }

    @PutMapping("/beneficiaries/{id}/favorite")
    public ResponseEntity<ApiResponse<BeneficiaryResponse>> toggleBeneficiaryFavorite(
            @PathVariable UUID id) {
        UUID clientId = resolveClientId();
        BeneficiaryResponse b = beneficiaryService.toggleFavorite(clientId, id);
        return ResponseEntity.ok(ApiResponse.success("Favorite toggled", b));
    }

    @DeleteMapping("/beneficiaries/{id}")
    public ResponseEntity<ApiResponse<Void>> deleteBeneficiary(@PathVariable UUID id) {
        UUID clientId = resolveClientId();
        beneficiaryService.delete(clientId, id);
        return ResponseEntity.ok(ApiResponse.success("Beneficiary deleted", null));
    }

    private UUID resolveClientId() {
        UUID keycloakId = securityUtils.getCurrentUserId();
        return userRepository.findByKeycloakId(keycloakId)
                .filter(u -> u instanceof Client)
                .orElseThrow(() -> new ResourceNotFoundException("Client not found"))
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
