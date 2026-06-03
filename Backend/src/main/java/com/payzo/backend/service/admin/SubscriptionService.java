package com.payzo.backend.service.admin;

import com.payzo.backend.domain.entity.Client;
import com.payzo.backend.domain.entity.User;
import com.payzo.backend.domain.enums.UserNotificationType;
import com.payzo.backend.domain.enums.UserStatus;
import com.payzo.backend.dto.response.admin.AuditLogResponse;
import com.payzo.backend.dto.response.admin.CbsAccountResponse;
import com.payzo.backend.dto.response.admin.CbsClientPreviewResponse;
import com.payzo.backend.dto.response.admin.ClientCbsSummaryResponse;
import com.payzo.backend.dto.response.admin.SubscriptionResponse;
import com.payzo.backend.exception.AccountBlockedException;
import com.payzo.backend.exception.ConflictException;
import com.payzo.backend.exception.ResourceNotFoundException;
import com.payzo.backend.mapper.UserMapper;
import com.payzo.backend.repository.AuditLogRepository;
import com.payzo.backend.repository.ClientRepository;
import com.payzo.backend.repository.BeneficiaryRepository;
import com.payzo.backend.repository.FraudAlertRepository;
import com.payzo.backend.repository.NotificationRepository;
import com.payzo.backend.repository.OtpTokenRepository;
import com.payzo.backend.repository.TransactionRepository;
import com.payzo.backend.repository.UserNotificationRepository;
import com.payzo.backend.repository.UserRepository;
import com.payzo.backend.dto.client.ClientProfile;
import com.payzo.backend.service.audit.AuditService;
import com.payzo.backend.service.auth.OtpService;
import com.payzo.backend.service.client.ClientProfileService;
import com.payzo.backend.service.integration.CbsIntegrationService;
import com.payzo.backend.service.integration.CbsIntegrationService.CbsClientData;
import com.payzo.backend.service.integration.KeycloakAdminService;
import com.payzo.backend.security.BlockedUserFilter;
import com.payzo.backend.service.notification.InAppNotificationService;
import com.payzo.backend.service.notification.NotificationService;
import com.payzo.backend.util.PasswordGenerator;
import com.payzo.backend.util.SearchSpecification;
import com.payzo.backend.util.UsernameGenerator;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/** Admin queue for new client registrations with approve, reject, and direct-register actions backed by Keycloak provisioning. */
@Service
@RequiredArgsConstructor
@Slf4j
public class SubscriptionService {

    private final ClientRepository clientRepository;
    private final UserRepository userRepository;
    private final TransactionRepository transactionRepository;
    private final FraudAlertRepository fraudAlertRepository;
    private final BeneficiaryRepository beneficiaryRepository;
    private final UserNotificationRepository userNotificationRepository;
    private final NotificationRepository notificationRepository;
    private final OtpTokenRepository otpTokenRepository;
    private final CbsIntegrationService cbsIntegrationService;
    private final ClientProfileService clientProfileService;
    private final KeycloakAdminService keycloakAdminService;
    private final NotificationService notificationService;
    private final InAppNotificationService inAppNotificationService;
    private final AuditService auditService;
    private final PasswordGenerator passwordGenerator;
    private final UsernameGenerator usernameGenerator;
    private final UserMapper userMapper;
    private final AuditLogRepository auditLogRepository;
    private final BlockedUserFilter blockedUserFilter;

    @Transactional(readOnly = true)
    public Page<SubscriptionResponse> getPendingSubscriptions(String query, Pageable pageable) {
        // Search every column the admin can see when the row is expanded
        // — admins regularly type a phone or governorate they got from a
        // support ticket. UUID fields ({@code id}, {@code keycloakId})
        // let the admin paste an id pulled from logs / Keycloak console
        // and find the row.
        Specification<Client> spec = SearchSpecification.build(query,
                CLIENT_SEARCH_STRING_FIELDS,
                CLIENT_SEARCH_UUID_FIELDS,
                Map.of("status", UserStatus.PENDING));
        return clientRepository.findAll(spec, pageable)
                .map(this::toEnrichedResponse);
    }

    /** Strings + UUIDs the BO Clients page searches across. Kept as a single
     *  source of truth so the pending-tab and the all-tabs path stay in sync.
     *  Adding a field here automatically extends every list endpoint that
     *  uses {@link #clientFilterSpec} or this method. */
    private static final String[] CLIENT_SEARCH_STRING_FIELDS = {
            "firstName", "lastName", "cin", "username",
            "email", "phone", "address", "governorate",
    };
    private static final String[] CLIENT_SEARCH_UUID_FIELDS = {
            "id", "keycloakId",
    };

    @Transactional(readOnly = true)
    public SubscriptionResponse getSubscriptionDetail(UUID userId) {
        Client client = clientRepository.findById(userId)
                .orElseThrow(() -> new ResourceNotFoundException("Client not found: " + userId));
        return toEnrichedResponse(client);
    }

    /**
     * Maps a {@link Client} to {@link SubscriptionResponse} and back-fills
     * any null contact / identity fields from CBS. Used by every list +
     * detail endpoint so the BO Clients-page expanded row renders the
     * full picture even for PENDING clients (where the local User row
     * doesn't yet have email/phone/etc.). Approved clients have those
     * fields cached locally during {@code approveSubscription} /
     * {@code directSubscribe}, but going through this helper anyway is
     * cheap (CBS is now an in-process JPA datasource per D2 / Batch 8)
     * and means the display is always reconciled against CBS.
     */
    private SubscriptionResponse toEnrichedResponse(Client client) {
        SubscriptionResponse response = userMapper.toSubscriptionResponse(client);
        try {
            ClientProfile profile = clientProfileService.forClient(client);
            if (response.getEmail() == null) response.setEmail(profile.email());
            if (response.getPhone() == null) response.setPhone(profile.phone());
            if (response.getAddress() == null) response.setAddress(profile.address());
            if (response.getGovernorate() == null) response.setGovernorate(profile.governorate());
            if (response.getDateOfBirth() == null) response.setDateOfBirth(profile.dateOfBirth());
        } catch (Exception e) {
            log.debug("CBS enrich skipped for clientId={} ({}): falling back to local row",
                    client.getId(), e.getMessage());
        }
        return response;
    }

    @Transactional
    public void approveSubscription(UUID userId, UUID adminId) {
        Client client = clientRepository.findById(userId)
                .orElseThrow(() -> new ResourceNotFoundException("Client not found: " + userId));

        if (client.getStatus() != UserStatus.PENDING) {
            throw new ConflictException("Client is not in PENDING status", "INVALID_STATUS");
        }

        ClientProfile profile = clientProfileService.forClient(client);
        String tempPassword = passwordGenerator.generate();

        UUID keycloakId = keycloakAdminService.createClientUser(
                client.getCin(), profile.email(),
                client.getFirstName(), client.getLastName(), tempPassword);

        client.setKeycloakId(keycloakId);
        // The Clients page treats "Accepted" as a derived UX state — a client with
        // status=ACTIVE and firstLoginCompleted=false. There is no separate ACCEPTED
        // status enum in the lifecycle; first login flips firstLoginCompleted=true.
        // Until then the row appears in the All tab as an ACCEPTED-pilled row and in
        // the Accepted tab (which spans status IN (ACTIVE, BLOCKED)) as an ACTIVE row.
        client.setStatus(UserStatus.ACTIVE);
        // Cache CBS identity locally so the Clients-page expanded row has the
        // full picture without a per-render CBS call. Mirrors directSubscribe()
        // below — same fields, same source. CBS stays the source of truth.
        client.setEmail(profile.email());
        client.setPhone(profile.phone());
        client.setGovernorate(profile.governorate());
        client.setAddress(profile.address());
        client.setDateOfBirth(profile.dateOfBirth());
        // Pick a sensible default destination-account so "send to @them" works
        // immediately after approval. Without this, every recipient lookup
        // hits NO_DEFAULT_ACCOUNT (UserLookupService:55). Prefer CHECKING; fall
        // back to the first account if no CHECKING exists. Client can change
        // it later from their profile.
        client.setDefaultAccountId(pickDefaultAccountForCin(client.getCin()));
        userRepository.findById(adminId).ifPresent(admin -> {
            client.setCreatedBy(admin);
            client.setDecidedBy(admin);
        });
        client.setDecidedAt(OffsetDateTime.now());
        clientRepository.save(client);

        notificationService.send("CREDENTIALS", profile.email(), profile.phone(),
                Map.of("username", client.getUsername(), "password", tempPassword));

        inAppNotificationService.create(client.getId(), "Registration approved",
                "Your registration has been approved. Check your email for credentials.",
                UserNotificationType.REGISTRATION_APPROVED);

        auditService.writeLog(adminId, "ADMIN", "CLIENT_APPROVED",
                "USER", client.getId(), null);

        log.info("Approved subscription: userId={}, keycloakId={}", userId, keycloakId);
    }

    @Transactional
    public void rejectSubscription(UUID userId, String reason, UUID adminId) {
        Client client = clientRepository.findById(userId)
                .orElseThrow(() -> new ResourceNotFoundException("Client not found: " + userId));

        if (client.getStatus() != UserStatus.PENDING) {
            throw new ConflictException("Client is not in PENDING status", "INVALID_STATUS");
        }

        client.setStatus(UserStatus.REJECTED);
        client.setDecisionReason(reason);
        userRepository.findById(adminId).ifPresent(client::setDecidedBy);
        client.setDecidedAt(OffsetDateTime.now());
        clientRepository.save(client);

        ClientProfile profile = clientProfileService.forClient(client);
        notificationService.send("REJECTION", profile.email(), profile.phone(),
                Map.of("reason", reason != null ? reason : "No reason provided"));

        inAppNotificationService.create(client.getId(), "Registration rejected",
                "Your registration has been rejected." + (reason != null ? " Reason: " + reason : ""),
                UserNotificationType.REGISTRATION_REJECTED);

        auditService.writeLog(adminId, "ADMIN", "CLIENT_REJECTED",
                "USER", client.getId(), reason);

        log.info("Rejected subscription: userId={}", userId);
    }

    /**
     * Preview a CBS client by CIN — drives the "Register client" dialog on the
     * Clients page. Returns the CBS-side identity plus an `alreadyRegistered`
     * flag so the FE can disable the Create button if this CIN is already a
     * PayZo client. Throws CbsClientNotFoundException (→ 404) when the CIN
     * doesn't exist in CBS at all.
     */
    @Transactional(readOnly = true)
    public CbsClientPreviewResponse previewCbsClient(String cin) {
        CbsClientData data = cbsIntegrationService.getClientByCin(cin);
        boolean alreadyRegistered = clientRepository.existsByCin(cin);
        return new CbsClientPreviewResponse(
                cin,
                data.firstName(), data.lastName(),
                data.email(), data.phone(),
                data.governorate(), data.address(),
                data.dateOfBirth(),
                alreadyRegistered);
    }

    @Transactional
    public void directSubscribe(String cin, UUID adminId) {
        if (clientRepository.existsByCin(cin)) {
            throw new ConflictException("CIN already registered", "CIN_ALREADY_REGISTERED");
        }

        CbsClientData cbsClient = cbsIntegrationService.getClientByCin(cin);
        String tempPassword = passwordGenerator.generate();

        UUID keycloakId = keycloakAdminService.createClientUser(
                cin, cbsClient.email(), cbsClient.firstName(), cbsClient.lastName(), tempPassword);

        Client client = new Client();
        client.setCin(cin);
        client.setUsername(usernameGenerator.generateFor(cbsClient.firstName(), cbsClient.lastName()));
        // Cache CBS identity locally so the Clients-page expanded row has the
        // full picture without a per-render CBS call. CBS stays the source of
        // truth — these fields can be re-synced from CBS if they drift.
        client.setFirstName(cbsClient.firstName());
        client.setLastName(cbsClient.lastName());
        client.setEmail(cbsClient.email());
        client.setPhone(cbsClient.phone());
        client.setGovernorate(cbsClient.governorate());
        client.setAddress(cbsClient.address());
        client.setDateOfBirth(cbsClient.dateOfBirth());
        client.setStatus(UserStatus.ACTIVE);
        client.setKeycloakId(keycloakId);
        // Same auto-pick as approveSubscription() — keep the two paths in sync
        // so direct-subscribed clients can also be sent money to immediately.
        client.setDefaultAccountId(pickDefaultAccountForCin(client.getCin()));
        userRepository.findById(adminId).ifPresent(admin -> {
            client.setCreatedBy(admin);
            client.setDecidedBy(admin);
        });
        client.setDecidedAt(OffsetDateTime.now());
        clientRepository.save(client);

        notificationService.send("CREDENTIALS", cbsClient.email(), cbsClient.phone(),
                Map.of("username", client.getUsername(), "password", tempPassword));

        auditService.writeLog(adminId, "ADMIN", "CLIENT_APPROVED",
                "USER", client.getId(), "Direct subscription");

        log.info("Direct subscription: cin={}, keycloakId={}", cin, keycloakId);
    }

    /**
     * Pick a sensible default destination-account for a freshly-approved
     * client. CBS exposes 1+ accounts per client; we default to the first
     * CHECKING (typical "everyday" account) and fall back to whatever
     * comes first if no CHECKING exists. Returns {@code null} (so the
     * column stays {@code NULL}) only if CBS has no accounts for this
     * CIN at all, or the CBS call fails — both unusual; the client can
     * still pick one manually later. Approval is not blocked.
     */
    private String pickDefaultAccountForCin(String cin) {
        try {
            List<CbsIntegrationService.CbsAccountData> accounts =
                    cbsIntegrationService.getAccountsByClientCin(cin);
            if (accounts.isEmpty()) {
                log.warn("Default account selection: CBS returned no accounts for cin={}", cin);
                return null;
            }
            return accounts.stream()
                    .filter(a -> "CHECKING".equalsIgnoreCase(a.type()))
                    .map(CbsIntegrationService.CbsAccountData::accountNumber)
                    .findFirst()
                    .orElseGet(() -> accounts.get(0).accountNumber());
        } catch (Exception ex) {
            log.warn("Default account selection failed for cin={}: {}", cin, ex.getMessage());
            return null;
        }
    }

    /**
     * Same as {@link #getClients(UserStatus, String, Pageable)} but additionally
     * narrows the result set to clients who hold at least one CBS account in
     * the given bank. Used by the Accounts page bank-filter dropdown.
     */
    @Transactional(readOnly = true)
    public Page<SubscriptionResponse> getClientsByBank(
            String bankCode, UserStatus status, String query, Pageable pageable) {
        java.util.Set<String> cinsInBank = cbsIntegrationService.findClientCinsByBankCode(bankCode);
        if (cinsInBank.isEmpty()) {
            return Page.empty(pageable);
        }
        // Compose with the standard tab/search filter so all the existing
        // semantics (ACCEPTED-broad, ACTIVE+firstLogin) still apply.
        Specification<Client> base = clientFilterSpec(status, query);
        Specification<Client> inBank = (root, cq, cb) -> root.get("cin").in(cinsInBank);
        return clientRepository.findAll(base.and(inBank), pageable)
                .map(this::toEnrichedResponse);
    }

    @Transactional(readOnly = true)
    public Page<SubscriptionResponse> getClients(UserStatus status, String query, Pageable pageable) {
        return clientRepository.findAll(clientFilterSpec(status, query), pageable)
                .map(this::toEnrichedResponse);
    }

    /**
     * Shared tab/search filter for the Clients-page list endpoints.
     *
     *   null      → no status filter (the "All" tab — every status)
     *   ACCEPTED  → broad: status IN (ACTIVE, BLOCKED). Covers every client
     *               past admin approval, whether or not they've logged in.
     *   ACTIVE    → status=ACTIVE AND firstLoginCompleted=true. Excludes
     *               freshly-accepted-but-never-logged-in clients (those
     *               surface in the Accepted tab + the All tab as ACCEPTED-pilled).
     *   else      → exact-match equality on the requested status.
     *
     * Per the FE spec, "Accepted" is a derived UX state — there is NO ACCEPTED
     * row in the DB in normal operation. Only 4 real statuses are emitted:
     * PENDING, ACTIVE, BLOCKED, REJECTED.
     */
    private Specification<Client> clientFilterSpec(UserStatus status, String query) {
        Specification<Client> spec = SearchSpecification.build(query,
                CLIENT_SEARCH_STRING_FIELDS,
                CLIENT_SEARCH_UUID_FIELDS,
                new HashMap<>());

        // Account-number search lives in CBS, not payzo_db.users — resolve any
        // CBS accounts whose number contains the query, pull their CINs, and OR
        // them onto the base search. Empty set means no account match, which
        // collapses to a no-op disjunct (the base spec still drives results).
        if (query != null && !query.isBlank()) {
            java.util.Set<String> cinsByAccount =
                    cbsIntegrationService.findClientCinsByAccountNumber(query.trim());
            if (!cinsByAccount.isEmpty()) {
                Specification<Client> byAccount = (root, cq, cb) ->
                        root.get("cin").in(cinsByAccount);
                spec = spec.or(byAccount);
            }
        }

        if (status == UserStatus.ACCEPTED) {
            // ACCEPTED is the "approved but never logged in" bucket — admin
            // has accepted them, Keycloak user exists, but they haven't
            // completed their first login yet. Distinct from ACTIVE.
            Specification<Client> acceptedPreFirstLogin = (root, cq, cb) -> cb.and(
                    cb.equal(root.get("status"), UserStatus.ACTIVE),
                    cb.equal(root.get("firstLoginCompleted"), false));
            spec = spec.and(acceptedPreFirstLogin);
        } else if (status == UserStatus.ACTIVE) {
            Specification<Client> active = (root, cq, cb) -> cb.and(
                    cb.equal(root.get("status"), UserStatus.ACTIVE),
                    cb.equal(root.get("firstLoginCompleted"), true));
            spec = spec.and(active);
        } else if (status != null) {
            Specification<Client> exact = (root, cq, cb) ->
                    cb.equal(root.get("status"), status);
            spec = spec.and(exact);
        }
        return spec;
    }

    /**
     * Full per-account CBS detail for one client — drives the Accounts-page
     * expanded view. Returns an empty list (rather than throwing) on CBS
     * hiccups so the dropdown renders cleanly.
     */
    @Transactional(readOnly = true)
    public List<CbsAccountResponse> getCbsAccounts(UUID userId) {
        Client client = clientRepository.findById(userId)
                .orElseThrow(() -> new ResourceNotFoundException("Client not found: " + userId));
        try {
            return cbsIntegrationService.getAccountsByClientCin(client.getCin()).stream()
                    .map(a -> new CbsAccountResponse(
                            a.accountNumber(), a.bankCode(), a.type(), a.balance()))
                    .toList();
        } catch (Exception ex) {
            log.warn("CBS accounts lookup failed for client {} (cin={}): {}",
                    userId, client.getCin(), ex.getMessage());
            return List.of();
        }
    }

    /**
     * Returns aggregated CBS state for a single client — used by the Clients page
     * when a row is expanded. Wrapped in a try/catch so a CBS hiccup doesn't break
     * the expanded view; in that case we return zeros and let the FE render "—".
     */
    @Transactional(readOnly = true)
    public ClientCbsSummaryResponse getCbsSummary(UUID userId) {
        Client client = clientRepository.findById(userId)
                .orElseThrow(() -> new ResourceNotFoundException("Client not found: " + userId));

        try {
            List<CbsIntegrationService.CbsAccountData> accounts =
                    cbsIntegrationService.getAccountsByClientCin(client.getCin());
            BigDecimal total = accounts.stream()
                    .map(CbsIntegrationService.CbsAccountData::balance)
                    .reduce(BigDecimal.ZERO, BigDecimal::add);
            return new ClientCbsSummaryResponse(accounts.size(), total);
        } catch (Exception ex) {
            log.warn("CBS summary lookup failed for client {} (cin={}): {}",
                    userId, client.getCin(), ex.getMessage());
            return new ClientCbsSummaryResponse(0, BigDecimal.ZERO);
        }
    }

    @Transactional
    public void blockClient(UUID userId, UUID adminId) {
        Client client = clientRepository.findById(userId)
                .orElseThrow(() -> new ResourceNotFoundException("Client not found: " + userId));

        if (client.getStatus() == UserStatus.BLOCKED) {
            throw new ConflictException("Client is already blocked", "ALREADY_BLOCKED");
        }
        if (client.getKeycloakId() == null) {
            throw new ConflictException("Client has no Keycloak account", "INVALID_STATUS");
        }

        keycloakAdminService.disableUser(client.getKeycloakId(), "clients");
        client.setStatus(UserStatus.BLOCKED);
        userRepository.findById(adminId).ifPresent(client::setDecidedBy);
        client.setDecidedAt(OffsetDateTime.now());
        clientRepository.save(client);

        blockedUserFilter.evictUser(client.getKeycloakId());

        ClientProfile blockedProfile = clientProfileService.forClient(client);
        notificationService.send("ACCOUNT_BLOCKED", blockedProfile.email(), blockedProfile.phone(), null);

        auditService.writeLog(adminId, "ADMIN", "CLIENT_BLOCKED",
                "USER", client.getId(), null);

        log.info("Blocked client: userId={}", userId);
    }

    /**
     * Hard-delete a client and every row that references them (transactions,
     * fraud alerts, beneficiaries, notifications, audit, OTPs) plus the matching
     * Keycloak user. Used by the Clients-page expanded-row Delete button.
     *
     * Order matters because of FK constraints:
     *   1. fraud_alerts → transactions (alerts.transaction_id)
     *   2. transactions → users (tx.client_id)
     *   3. beneficiaries → users (client_id)
     *   4. user_notifications → users
     *   5. notifications (email/SMS log) → users (recipient_id)
     *   6. audit_logs → users (actor_id; we also drop USER-targeted rows)
     *   7. otp_tokens (no FK, but identifier may be cin or user-id-string)
     *   8. Keycloak account
     *   9. The user row
     */
    @Transactional
    public void deleteClient(UUID userId, UUID adminId) {
        Client client = clientRepository.findById(userId)
                .orElseThrow(() -> new ResourceNotFoundException("Client not found: " + userId));

        UUID keycloakId = client.getKeycloakId();
        String fullName = client.getFirstName() + " " + client.getLastName();
        String cin = client.getCin();

        fraudAlertRepository.deleteByTransactionClientId(userId);
        transactionRepository.deleteByClientId(userId);
        beneficiaryRepository.deleteByClientId(userId);
        userNotificationRepository.deleteByUserId(userId);
        notificationRepository.deleteByRecipientId(userId);
        auditLogRepository.deleteByActorIdOrTargetId(userId);
        otpTokenRepository.deleteByIdentifierIn(List.of(userId.toString(), cin));

        if (keycloakId != null) {
            try {
                keycloakAdminService.deleteUser(keycloakId, "clients");
                blockedUserFilter.evictUser(keycloakId);
            } catch (Exception ex) {
                // KC may have already lost the user (e.g. external admin action).
                // Don't block the DB delete — log and proceed.
                log.warn("Keycloak delete failed for user {} (kcId={}): {}",
                        userId, keycloakId, ex.getMessage());
            }
        }

        clientRepository.delete(client);

        // Re-record the deletion with the admin as the actor so the audit
        // trail of WHO deleted the client survives the cascade above.
        auditService.writeLog(adminId, "ADMIN", "CLIENT_DELETED",
                "USER", userId,
                "Deleted client " + fullName + " (cin=" + cin + ")");

        log.info("Deleted client: id={}, cin={}, hadKeycloak={}", userId, cin, keycloakId != null);
    }

    @Transactional
    public void unblockClient(UUID userId, UUID adminId) {
        Client client = clientRepository.findById(userId)
                .orElseThrow(() -> new ResourceNotFoundException("Client not found: " + userId));

        if (client.getStatus() != UserStatus.BLOCKED) {
            throw new ConflictException("Client is not blocked", "NOT_BLOCKED");
        }

        keycloakAdminService.enableUser(client.getKeycloakId(), "clients");
        client.setStatus(UserStatus.ACTIVE);
        userRepository.findById(adminId).ifPresent(client::setDecidedBy);
        client.setDecidedAt(OffsetDateTime.now());
        clientRepository.save(client);

        blockedUserFilter.evictUser(client.getKeycloakId());

        ClientProfile unblockedProfile = clientProfileService.forClient(client);
        notificationService.send("ACCOUNT_UNBLOCKED", unblockedProfile.email(), unblockedProfile.phone(), null);

        auditService.writeLog(adminId, "ADMIN", "CLIENT_UNBLOCKED",
                "USER", client.getId(), null);

        log.info("Unblocked client: userId={}", userId);
    }

    @Transactional(readOnly = true)
    public Page<AuditLogResponse> getDecisionHistory(UUID adminId, Pageable pageable) {
        return auditLogRepository.findByActorIdOrderByCreatedAtDesc(adminId, pageable)
                .map(userMapper::toAuditLogResponse);
    }
}
