package com.payzo.backend.service.client;

import com.payzo.backend.cbs.entity.CbsAccount;
import com.payzo.backend.cbs.entity.CbsClient;
import com.payzo.backend.cbs.entity.CbsTransaction;
import com.payzo.backend.cbs.entity.TransactionType;
import com.payzo.backend.cbs.repository.CbsAccountRepository;
import com.payzo.backend.cbs.repository.CbsTransactionRepository;
import com.payzo.backend.domain.entity.Bank;
import com.payzo.backend.domain.entity.Client;
import com.payzo.backend.domain.entity.FraudAlert;
import com.payzo.backend.domain.entity.Transaction;
import com.payzo.backend.domain.enums.TransactionStatus;
import com.payzo.backend.domain.enums.AlertStatus;
import com.payzo.backend.domain.enums.RiskLevel;
import com.payzo.backend.dto.client.ClientProfile;
import com.payzo.backend.dto.response.client.AccountResponse;
import com.payzo.backend.dto.response.client.AlertResponse;
import com.payzo.backend.dto.response.client.ClientAlertSummary;
import com.payzo.backend.dto.response.client.ProfileResponse;
import com.payzo.backend.dto.response.client.TransactionResponse;
import com.payzo.backend.dto.response.common.PagedResponse;
import com.payzo.backend.exception.ConflictException;
import com.payzo.backend.exception.ResourceNotFoundException;
import com.payzo.backend.exception.UnprocessableEntityException;
import com.payzo.backend.mapper.TransactionMapper;
import com.payzo.backend.repository.BankRepository;
import com.payzo.backend.repository.ClientRepository;
import com.payzo.backend.repository.FraudAlertRepository;
import com.payzo.backend.repository.TransactionRepository;
import com.payzo.backend.repository.UserRepository;
import com.payzo.backend.service.audit.AuditService;
import com.payzo.backend.service.integration.CbsIntegrationService;
import com.payzo.backend.service.integration.CbsIntegrationService.CbsAccountData;
import com.payzo.backend.service.integration.CbsIntegrationService.CbsClientData;
import com.payzo.backend.service.integration.KeycloakAdminService;
import com.payzo.backend.util.ClientAlertStatusMapper;
import com.payzo.backend.util.PasswordPolicy;
import com.payzo.backend.util.PeriodUtils;
import com.payzo.backend.util.UsernameValidator;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

/** Client-facing aggregator for profile (PayZo + CBS), accounts, transactions, alerts, and the profile-picture upload. */
@Service
@RequiredArgsConstructor
@Slf4j
public class ClientService {

    private final ClientRepository clientRepository;
    private final TransactionRepository transactionRepository;
    private final FraudAlertRepository fraudAlertRepository;
    private final BankRepository bankRepository;
    private final UserRepository userRepository;
    private final CbsIntegrationService cbsIntegrationService;
    private final CbsTransactionRepository cbsTransactionRepository;
    private final CbsAccountRepository cbsAccountRepository;
    private final ClientProfileService clientProfileService;
    private final KeycloakAdminService keycloakAdminService;
    private final AuditService auditService;
    private final TransactionMapper transactionMapper;

    @Value("${uploads.path}")
    private String uploadsPath;

    private static final Set<String> ALLOWED_CONTENT_TYPES = Set.of(
            "image/jpeg", "image/png", "image/webp");

    private static final long MAX_FILE_SIZE = 5 * 1024 * 1024;

    @Transactional
    public ProfileResponse getProfile(UUID clientId) {
        ClientProfile profile = clientProfileService.getProfile(clientId);

        // Lazy backfill of `default_account_id`. Clients approved before
        // the auto-pick logic in SubscriptionService landed have NULL in
        // this column, which breaks every "send to @them" flow with a
        // NO_DEFAULT_ACCOUNT 409 (UserLookupService:55). Heal on the
        // first dashboard load — idempotent (only runs while the column
        // is null). Failures are swallowed: an unhealthy CBS shouldn't
        // block the user from seeing their profile.
        if (profile.defaultAccountId() == null || profile.defaultAccountId().isBlank()) {
            try {
                List<CbsAccountData> accounts =
                        cbsIntegrationService.getAccountsByClientCin(profile.cin());
                if (!accounts.isEmpty()) {
                    String picked = accounts.stream()
                            .filter(a -> "CHECKING".equalsIgnoreCase(a.type()))
                            .map(CbsAccountData::accountNumber)
                            .findFirst()
                            .orElseGet(() -> accounts.get(0).accountNumber());
                    Client client = clientRepository.findById(clientId)
                            .orElseThrow(() -> new ResourceNotFoundException(
                                    "Client not found: " + clientId));
                    client.setDefaultAccountId(picked);
                    clientRepository.save(client);
                    log.info("Backfilled defaultAccountId={} for clientId={}", picked, clientId);
                    // Re-read so the response reflects the freshly persisted value.
                    profile = clientProfileService.getProfile(clientId);
                }
            } catch (Exception ex) {
                log.warn("Default account backfill failed for clientId={}: {}",
                        clientId, ex.getMessage());
            }
        }

        return ProfileResponse.builder()
                .id(profile.id())
                .cin(profile.cin())
                .username(profile.username())
                .firstName(profile.firstName())
                .lastName(profile.lastName())
                .email(profile.email())
                .phone(profile.phone())
                .address(profile.address())
                .governorate(profile.governorate())
                .dateOfBirth(profile.dateOfBirth())
                .profilePictureUrl(profile.profilePictureUrl())
                .firstLoginCompleted(profile.firstLoginCompleted())
                .trustScore(profile.trustScore())
                .defaultAccountId(profile.defaultAccountId())
                .build();
    }

    /**
     * Persist the client's chosen default destination account. The
     * account number must resolve to a CBS account whose
     * {@code clientCin} matches this client — otherwise we surface
     * a 404 (rather than 403) so we don't leak whether an arbitrary
     * account number exists in CBS. Returns the saved value so the
     * controller can echo it back in the response, which the FE uses
     * to optimistically patch the {@code me} cache.
     */
    @Transactional
    public String setDefaultAccount(UUID clientId, String accountNumber) {
        Client client = clientRepository.findById(clientId)
                .orElseThrow(() -> new ResourceNotFoundException("Client not found: " + clientId));

        CbsAccountData account;
        try {
            account = cbsIntegrationService.getAccountByNumber(accountNumber);
        } catch (Exception ex) {
            // CBS missing / 404 / network — treat as "account not found for you".
            throw new ResourceNotFoundException("Account not found");
        }
        if (account == null || !accountNumber.equals(account.accountNumber())
                || !client.getCin().equals(account.clientCin())) {
            // Either the lookup returned nothing, or the account belongs to
            // a different CIN. Same generic 404 either way — don't leak
            // existence to a curious client.
            throw new ResourceNotFoundException("Account not found");
        }

        client.setDefaultAccountId(accountNumber);
        clientRepository.save(client);

        auditService.writeLog(clientId, "CLIENT", "DEFAULT_ACCOUNT_UPDATED",
                "USER", clientId, "accountNumber=" + accountNumber);

        log.info("Updated defaultAccountId for clientId={} → {}", clientId, accountNumber);
        return accountNumber;
    }

    /**
     * Edit the client's {@code @username} (D54). Auto-generated at
     * registration as {@code firstname.lastname}; clients can rebrand
     * later (e.g. a coffee shop owner takes {@code @coffee.forever} so
     * customers can pay them by username).
     *
     * <p>Three rejection paths:
     * <ul>
     *   <li>422 {@code USERNAME_INVALID} — fails
     *       {@link UsernameValidator#USERNAME_REGEX} (length / charset / starts-with-letter).
     *   <li>409 {@code USERNAME_RESERVED} — the requested handle is on
     *       {@link UsernameValidator#RESERVED} (staff impersonation, sentinels).
     *   <li>409 {@code USERNAME_TAKEN} — case-insensitive collision with any
     *       other user row (clients + backoffice + pending registrations).
     * </ul>
     *
     * <p>Idempotent: a PATCH with the same value the client already has
     * returns the existing profile without writing the row (no spurious
     * {@code updated_at} bump, no audit-log noise). The "same value" check
     * runs <em>after</em> format validation so the user still gets a 422 if
     * they submit a garbage value that happens to match the persisted one
     * (defensive — shouldn't be reachable since stored usernames already
     * pass the regex).
     *
     * <p>Returns the freshly-assembled {@link ProfileResponse} so the
     * caller can hydrate {@code MeProvider} without a second
     * {@code GET /profile}. CBS is the source of truth for the contact /
     * address fields on that response, so this method delegates to
     * {@link ClientProfileService#getProfile} for the read-back.
     */
    @Transactional
    public ProfileResponse updateUsername(UUID clientId, String rawUsername) {
        Client client = clientRepository.findById(clientId)
                .orElseThrow(() -> new ResourceNotFoundException("Client not found: " + clientId));

        String normalized = UsernameValidator.normalize(rawUsername);

        if (!UsernameValidator.matchesFormat(normalized)) {
            throw new UnprocessableEntityException(
                    "Username must be 3–30 characters: lowercase letters, digits, "
                            + "dots or underscores; must start with a letter.",
                    "USERNAME_INVALID");
        }

        // Same value as today — no-op (no row write, no audit, no updated_at bump).
        if (normalized.equalsIgnoreCase(client.getUsername())) {
            return getProfile(clientId);
        }

        if (UsernameValidator.isReserved(normalized)) {
            throw new ConflictException(
                    "This username is reserved.", "USERNAME_RESERVED");
        }

        if (userRepository.existsByUsernameIgnoreCase(normalized)) {
            throw new ConflictException(
                    "This username is already taken.", "USERNAME_TAKEN");
        }

        String previous = client.getUsername();
        client.setUsername(normalized);
        clientRepository.save(client);

        auditService.writeLog(clientId, "CLIENT", "USERNAME_CHANGED",
                "USER", clientId,
                "from=" + previous + " to=" + normalized);

        log.info("Username changed for clientId={}: {} → {}", clientId, previous, normalized);
        return getProfile(clientId);
    }

    @Transactional
    public String updateProfilePicture(UUID clientId, MultipartFile file) {
        Client client = clientRepository.findById(clientId)
                .orElseThrow(() -> new ResourceNotFoundException("Client not found: " + clientId));

        if (file.isEmpty()) {
            throw new ConflictException("File is empty", "INVALID_FILE");
        }
        if (file.getSize() > MAX_FILE_SIZE) {
            throw new ConflictException("File exceeds 5MB limit", "FILE_TOO_LARGE");
        }
        if (!ALLOWED_CONTENT_TYPES.contains(file.getContentType())) {
            throw new ConflictException("Only JPEG, PNG, and WEBP are allowed", "INVALID_FILE_TYPE");
        }

        try {
            Path uploadDir = Paths.get(uploadsPath, "profile-pictures");
            Files.createDirectories(uploadDir);

            String filename = clientId + ".jpg";
            Path target = uploadDir.resolve(filename);
            Files.copy(file.getInputStream(), target, StandardCopyOption.REPLACE_EXISTING);

            String url = "/api/v1/uploads/profile-pictures/" + filename;
            client.setProfilePictureUrl(url);
            clientRepository.save(client);

            log.info("Updated profile picture for client {}", clientId);
            return url;
        } catch (IOException e) {
            throw new RuntimeException("Failed to save profile picture", e);
        }
    }

    /**
     * In-profile password change (DECISIONS.md D45 / Impact 21).
     *
     * The previous OTP-based two-step flow ({@code /profile/password/initiate} +
     * {@code /confirm}) is replaced by a single PATCH that re-verifies the user's
     * current password directly against Keycloak. The change has these effects:
     *
     *  - 401 with {@code INVALID_CURRENT_PASSWORD} when {@code currentPassword} is wrong.
     *  - 422 (via {@link PasswordPolicy}) when {@code newPassword} fails the policy.
     *  - 200 + Keycloak password set + sessions invalidated when both checks pass.
     */
    @Transactional
    public void changePassword(UUID clientId, String currentPassword, String newPassword) {
        Client client = clientRepository.findById(clientId)
                .orElseThrow(() -> new ResourceNotFoundException("Client not found: " + clientId));

        if (client.getKeycloakId() == null) {
            throw new ConflictException("Account has no Keycloak credentials yet",
                    "ACCOUNT_NOT_PROVISIONED");
        }

        if (!keycloakAdminService.verifyClientPassword(client.getCin(), currentPassword)) {
            throw new ConflictException("Current password is incorrect",
                    "INVALID_CURRENT_PASSWORD");
        }

        PasswordPolicy.enforce(newPassword);

        keycloakAdminService.changePassword(client.getKeycloakId(), "clients", newPassword);
        keycloakAdminService.invalidateUserSessions(client.getKeycloakId(), "clients");

        auditService.writeLog(client.getId(), "CLIENT", "PASSWORD_CHANGED",
                "USER", client.getId(), "in-profile change");

        log.info("Password changed in-profile for clientId={}", clientId);
    }

    @Transactional(readOnly = true)
    public List<AccountResponse> getAccounts(UUID clientId) {
        Client client = clientRepository.findById(clientId)
                .orElseThrow(() -> new ResourceNotFoundException("Client not found: " + clientId));

        List<CbsAccountData> cbsAccounts = cbsIntegrationService.getAccountsByClientCin(client.getCin());

        // D7: accounts whose bank has been deactivated are filtered out of the
        // client's view so they never appear in the send-money picker. Banks not
        // yet registered (orElse(null)) are also dropped — the bank table is the
        // platform's source of truth for what's selectable.
        return cbsAccounts.stream()
                .map(cbs -> {
                    Bank bank = bankRepository.findByCode(cbs.bankCode()).orElse(null);
                    if (bank == null || !bank.isActive()) return null;

                    AccountResponse resp = new AccountResponse();
                    resp.setAccountNumber(cbs.accountNumber());
                    resp.setBankCode(cbs.bankCode());
                    resp.setBankName(cbs.bankName());
                    resp.setType(cbs.type());
                    resp.setBalance(cbs.balance());
                    resp.setBankActive(true);
                    return resp;
                })
                .filter(java.util.Objects::nonNull)
                .toList();
    }

    @Transactional(readOnly = true)
    public Page<TransactionResponse> getAccountTransactions(String accountNumber, Pageable pageable) {
        // Direction is relative to *this account* — DEBIT when the account is
        // the source side (money out), CREDIT when it's the destination (money in).
        Set<String> singletonAccountSet = Set.of(accountNumber);
        return transactionRepository
                .findBySourceAccountNumberOrDestinationAccountNumberOrderByCreatedAtDesc(
                        accountNumber, accountNumber, pageable)
                .map(tx -> {
                    TransactionResponse r = transactionMapper.toTransactionResponse(tx);
                    r.setOrigin("PAYZO");
                    enrichPayZoTransactionResponse(r, tx, singletonAccountSet);
                    return r;
                });
    }

    /**
     * D7 — paged listing aggregating across all of the client's accounts. Reads
     * from two datasources:
     * <ul>
     *   <li>{@code payzo_db.transactions} — PayZo-originated P2P transfers in any
     *       status (PENDING / SUSPENDED / APPROVED / REJECTED).</li>
     *   <li>{@code cbs_db.cbs_transactions} — pre-existing bank transactions
     *       and the DEBIT/CREDIT pair backing every executed PayZo transfer.</li>
     * </ul>
     * The two streams are merged in memory, deduplicated, sorted, and sliced.
     * Origin is exposed so the frontend can render a "PAYZO" / "EXTERNAL" pill
     * per row without re-deriving from {@code reference}.
     *
     * <p><b>Approximation note:</b> with no {@code q}, {@code totalElements} on
     * the returned {@code PagedResponse} is the un-deduped sum of the two source
     * counts, over-counting by the number of payzo↔cbs duplicates plus the
     * dropped internal-transfer CREDIT side. With a {@code q}, the merged rows
     * are materialised and filtered in memory, so the total is exact for the
     * fetched window. The frontend's infinite-scroll loader uses {@code hasMore}
     * via slice size, not the exact total.
     *
     * @param origin "PAYZO" → only PayZo-originated rows; "EXTERNAL" → only
     *               pre-PayZo legacy CBS rows; null/"ALL" → both.
     */
    @Transactional(readOnly = true)
    public PagedResponse<TransactionResponse> listMergedTransactions(UUID clientId,
                                                                     String type,
                                                                     TransactionStatus status,
                                                                     String bankCode,
                                                                     String period,
                                                                     String origin,
                                                                     String account,
                                                                     String query,
                                                                     int page,
                                                                     int size) {
        Client client = clientRepository.findById(clientId)
                .orElseThrow(() -> new ResourceNotFoundException("Client not found: " + clientId));

        Set<String> myAccountNumbers = cbsIntegrationService
                .getAccountsByClientCin(client.getCin()).stream()
                .map(CbsAccountData::accountNumber)
                .collect(Collectors.toSet());

        boolean wantPayZo = !"EXTERNAL".equalsIgnoreCase(origin);
        boolean wantCbs   = !isPayZoOnlyStatus(status);
        OffsetDateTime periodStart = period == null ? null : PeriodUtils.parsePeriodStart(period);

        // `q` is matched against the assembled rows (counterpart name/username,
        // reference, masked accounts, amount) rather than pushed into the two
        // datasource queries: a CBS row's counterpart name resolves only after
        // the per-row mapper runs, and the counterpart username lives in
        // payzo_db, so neither is reachable from a single CBS Specification.
        // When a query is present we pull the full candidate window (capped) and
        // filter in memory so paging + totals reflect the matches.
        String needle = (query == null || query.isBlank())
                ? null : query.trim().toLowerCase(Locale.ROOT);
        int fetchCeiling = needle != null ? 1000 : Math.min((page + 1) * size + 1, 1000);

        List<TransactionResponse> payzoRows = wantPayZo
                ? fetchPayZoTransactions(clientId, myAccountNumbers, type, status, bankCode,
                        periodStart, account, fetchCeiling)
                : List.of();

        Set<String> payzoRefs = payzoRows.stream()
                .map(TransactionResponse::getReference)
                .collect(Collectors.toSet());

        List<TransactionResponse> cbsRows = wantCbs
                ? fetchCbsTransactions(client.getCin(), myAccountNumbers, type, bankCode,
                        periodStart, origin, account, fetchCeiling, payzoRefs)
                : List.of();

        List<TransactionResponse> merged = new ArrayList<>(payzoRows.size() + cbsRows.size());
        merged.addAll(payzoRows);
        merged.addAll(cbsRows);
        if (needle != null) {
            merged.removeIf(r -> !matchesQuery(r, needle));
        }
        merged.sort(Comparator.comparing(TransactionResponse::getCreatedAt,
                Comparator.nullsLast(Comparator.reverseOrder())));

        long totalElements;
        if (needle != null) {
            // Filtered rows are fully materialised, so this is exact for the
            // fetched window (the 1000-row source cap still applies).
            totalElements = merged.size();
        } else {
            long payzoCount = wantPayZo
                    ? transactionRepository.count(buildPayZoSpec(clientId, myAccountNumbers, type, status,
                            bankCode, periodStart, account))
                    : 0;
            long cbsCount = wantCbs
                    ? cbsTransactionRepository.count(buildCbsSpec(client.getCin(), myAccountNumbers, type,
                            bankCode, periodStart, origin, account))
                    : 0;
            totalElements = payzoCount + cbsCount;
        }

        int from = Math.min(page * size, merged.size());
        int to = Math.min(from + size, merged.size());
        List<TransactionResponse> slice = merged.subList(from, to);

        int totalPages = (int) Math.max(1, Math.ceil((double) totalElements / size));

        return PagedResponse.<TransactionResponse>builder()
                .content(List.copyOf(slice))
                .page(page)
                .size(size)
                .totalElements(totalElements)
                .totalPages(totalPages)
                .build();
    }

    private static boolean isPayZoOnlyStatus(TransactionStatus status) {
        if (status == null) return false;
        return status == TransactionStatus.PENDING_OTP
                || status == TransactionStatus.PENDING_SCORING
                || status == TransactionStatus.SUSPENDED_PENDING_ANALYST
                || status == TransactionStatus.REJECTED
                || status == TransactionStatus.CANCELLED;
    }

    private List<TransactionResponse> fetchPayZoTransactions(UUID clientId,
                                                             Set<String> myAccountNumbers,
                                                             String type,
                                                             TransactionStatus status,
                                                             String bankCode,
                                                             OffsetDateTime periodStart,
                                                             String account,
                                                             int fetchCeiling) {
        Specification<Transaction> spec = buildPayZoSpec(clientId, myAccountNumbers, type, status,
                bankCode, periodStart, account);
        Pageable pageable = PageRequest.of(0, fetchCeiling, Sort.by(Sort.Direction.DESC, "createdAt"));
        return transactionRepository.findAll(spec, pageable).getContent().stream()
                .map(tx -> {
                    TransactionResponse r = transactionMapper.toTransactionResponse(tx);
                    r.setOrigin("PAYZO");
                    enrichPayZoTransactionResponse(r, tx, myAccountNumbers);
                    return r;
                })
                .toList();
    }

    private Specification<Transaction> buildPayZoSpec(UUID clientId,
                                                      Set<String> myAccountNumbers,
                                                      String type,
                                                      TransactionStatus status,
                                                      String bankCode,
                                                      OffsetDateTime periodStart,
                                                      String account) {
        Specification<Transaction> spec = (root, cq, cb) -> cb.or(
                cb.equal(root.get("client").get("id"), clientId),
                myAccountNumbers.isEmpty()
                        ? cb.disjunction()
                        : root.get("destinationAccountNumber").in(myAccountNumbers)
        );

        if (type != null && !type.isBlank() && !"ALL".equalsIgnoreCase(type)) {
            String t = type.toUpperCase();
            spec = switch (t) {
                case "SENT" -> spec.and((root, cq, cb) -> cb.and(
                        cb.equal(root.get("client").get("id"), clientId),
                        myAccountNumbers.isEmpty()
                                ? cb.conjunction()
                                : cb.not(root.get("destinationAccountNumber").in(myAccountNumbers))));
                case "RECEIVED" -> spec.and((root, cq, cb) -> cb.and(
                        myAccountNumbers.isEmpty()
                                ? cb.disjunction()
                                : root.get("destinationAccountNumber").in(myAccountNumbers),
                        cb.notEqual(root.get("client").get("id"), clientId)));
                case "INTERNAL" -> spec.and((root, cq, cb) -> cb.disjunction()); // none in payzo_db
                default -> spec;
            };
        }
        if (status != null) {
            final TransactionStatus statusValue = status;
            spec = spec.and((root, cq, cb) -> cb.equal(root.get("status"), statusValue));
        }
        if (bankCode != null && !bankCode.isBlank()) {
            String code = bankCode.trim();
            spec = spec.and((root, cq, cb) -> cb.or(
                    cb.equal(root.get("sourceBankCode"), code),
                    cb.equal(root.get("destBankCode"), code)
            ));
        }
        if (periodStart != null) {
            final OffsetDateTime ps = periodStart;
            spec = spec.and((root, cq, cb) -> cb.greaterThanOrEqualTo(root.get("createdAt"), ps));
        }
        if (account != null && !account.isBlank()) {
            String acc = account.trim();
            spec = spec.and((root, cq, cb) -> cb.or(
                    cb.equal(root.get("sourceAccountNumber"), acc),
                    cb.equal(root.get("destinationAccountNumber"), acc)
            ));
        }
        return spec;
    }

    private List<TransactionResponse> fetchCbsTransactions(String clientCin,
                                                           Set<String> myAccountNumbers,
                                                           String type,
                                                           String bankCode,
                                                           OffsetDateTime periodStart,
                                                           String origin,
                                                           String account,
                                                           int fetchCeiling,
                                                           Set<String> excludeRefs) {
        Specification<CbsTransaction> spec = buildCbsSpec(clientCin, myAccountNumbers, type,
                bankCode, periodStart, origin, account);
        Pageable pageable = PageRequest.of(0, fetchCeiling, Sort.by(Sort.Direction.DESC, "timestamp"));
        List<CbsTransaction> rows = cbsTransactionRepository.findAll(spec, pageable).getContent();

        Set<String> seenInternalDebitRefs = new HashSet<>();
        List<TransactionResponse> out = new ArrayList<>(rows.size());
        for (CbsTransaction tx : rows) {
            if (tx.getReferenceByPayZo() != null && excludeRefs.contains(tx.getReferenceByPayZo())) {
                continue;
            }

            boolean accountMine = myAccountNumbers.contains(tx.getAccount().getAccountNumber());
            boolean counterpartMine = tx.getCounterpartAccount() != null
                    && myAccountNumbers.contains(tx.getCounterpartAccount());

            if (accountMine && counterpartMine) {
                if (tx.getType() != TransactionType.DEBIT) continue;
                if (tx.getReferenceByPayZo() != null) {
                    if (!seenInternalDebitRefs.add(tx.getReferenceByPayZo())) continue;
                }
            }

            out.add(mapCbsToResponse(tx, myAccountNumbers));
        }
        return out;
    }

    private Specification<CbsTransaction> buildCbsSpec(String clientCin,
                                                       Set<String> myAccountNumbers,
                                                       String type,
                                                       String bankCode,
                                                       OffsetDateTime periodStart,
                                                       String origin,
                                                       String account) {
        Specification<CbsTransaction> spec = (root, cq, cb) -> {
            // JOIN FETCH the account so the per-row mapper can read
            // accountNumber + bankCode without a lazy proxy. Skipped for
            // count queries (Hibernate forbids fetch joins on counts).
            if (cq.getResultType() != Long.class && cq.getResultType() != long.class) {
                root.fetch("account");
            }
            return cb.equal(root.get("clientCin"), clientCin);
        };

        if ("PAYZO".equalsIgnoreCase(origin)) {
            spec = spec.and((root, cq, cb) -> cb.isNotNull(root.get("referenceByPayZo")));
        } else if ("EXTERNAL".equalsIgnoreCase(origin)) {
            spec = spec.and((root, cq, cb) -> cb.isNull(root.get("referenceByPayZo")));
        }

        if (type != null && !type.isBlank() && !"ALL".equalsIgnoreCase(type)) {
            String t = type.toUpperCase();
            spec = switch (t) {
                case "SENT" -> spec.and((root, cq, cb) -> cb.and(
                        cb.equal(root.get("type"), TransactionType.DEBIT),
                        myAccountNumbers.isEmpty()
                                ? cb.conjunction()
                                : cb.not(root.get("counterpartAccount").in(myAccountNumbers))));
                case "RECEIVED" -> spec.and((root, cq, cb) -> cb.and(
                        cb.equal(root.get("type"), TransactionType.CREDIT),
                        myAccountNumbers.isEmpty()
                                ? cb.conjunction()
                                : cb.not(root.get("counterpartAccount").in(myAccountNumbers))));
                case "INTERNAL" -> spec.and((root, cq, cb) -> cb.and(
                        cb.equal(root.get("type"), TransactionType.DEBIT),
                        myAccountNumbers.isEmpty()
                                ? cb.disjunction()
                                : root.get("counterpartAccount").in(myAccountNumbers)));
                default -> spec;
            };
        }
        if (bankCode != null && !bankCode.isBlank()) {
            String code = bankCode.trim();
            spec = spec.and((root, cq, cb) -> cb.equal(root.get("account").get("bankCode"), code));
        }
        if (periodStart != null) {
            final OffsetDateTime ps = periodStart;
            spec = spec.and((root, cq, cb) -> cb.greaterThanOrEqualTo(root.get("timestamp"), ps));
        }
        if (account != null && !account.isBlank()) {
            String acc = account.trim();
            spec = spec.and((root, cq, cb) -> cb.or(
                    cb.equal(root.get("account").get("accountNumber"), acc),
                    cb.equal(root.get("counterpartAccount"), acc)
            ));
        }
        return spec;
    }

    /**
     * Post-merge search predicate for the client transactions list. Runs on the
     * assembled {@link TransactionResponse} (not the two source queries) so the
     * fields a client actually sees — counterpart name + username, reference,
     * motif, the masked "BANK ••1234" accounts, the raw account numbers, and the
     * amount — are searchable in one place, including CBS rows whose counterpart
     * resolves only after mapping. {@code needle} must already be lowercase.
     */
    private static boolean matchesQuery(TransactionResponse r, String needle) {
        return containsIgnoreCase(r.getCounterpartName(), needle)
                || containsIgnoreCase(r.getCounterpartUsername(), needle)
                || containsIgnoreCase(r.getReference(), needle)
                || containsIgnoreCase(r.getMotif(), needle)
                || containsIgnoreCase(r.getSourceMaskedAccount(), needle)
                || containsIgnoreCase(r.getDestMaskedAccount(), needle)
                || containsIgnoreCase(r.getSourceAccountNumber(), needle)
                || containsIgnoreCase(r.getDestinationAccountNumber(), needle)
                || containsIgnoreCase(r.getCounterpartAccount(), needle)
                || (r.getAmount() != null && r.getAmount().toPlainString().contains(needle));
    }

    private static boolean containsIgnoreCase(String haystack, String lowerNeedle) {
        return haystack != null && haystack.toLowerCase(Locale.ROOT).contains(lowerNeedle);
    }

    private TransactionResponse mapCbsToResponse(CbsTransaction tx, Set<String> myAccountNumbers) {
        TransactionResponse r = new TransactionResponse();
        // CBS rows carry their own UUID — surface it so the FE's
        // {@code expandedId === tx.id} comparison can distinguish rows.
        // Without this every external row ends up with {@code id=null},
        // and toggling one collapses or expands them ALL together
        // (because {@code null === null}) — that was the "external rows
        // can't be closed + minimising a PayZo row pops every external
        // row open" bug.
        r.setId(tx.getId());
        r.setReference(tx.getReferenceByPayZo());
        r.setAmount(tx.getAmount());
        r.setMotif(tx.getDescription());
        r.setStatus(TransactionStatus.APPROVED);
        r.setCreatedAt(tx.getTimestamp());
        r.setExecutedAt(tx.getTimestamp());
        r.setTimestamp(tx.getTimestamp());
        r.setOrigin(tx.getReferenceByPayZo() != null ? "PAYZO" : "EXTERNAL");

        // Resolve the counterpart's bank code from CBS so the "Banks"
        // cell + masked-account labels in the expanded row don't render
        // as "— ••XXXX". Pre-PayZo rows (referenceByPayZo == null) are
        // overwhelmingly intra-bank in the seed dataset; we look up the
        // counterpart's CBS account and use its real bank code. If that
        // lookup fails (counterpart account isn't in CBS — possible for
        // genuinely external counterparties), fall back to the user's
        // own bank code rather than leaving it null.
        String myBankCode = tx.getAccount().getBankCode();
        String counterpartBankCode = tx.getCounterpartAccount() == null
                ? myBankCode
                : cbsAccountRepository.findByAccountNumber(tx.getCounterpartAccount())
                        .map(CbsAccount::getBankCode)
                        .orElse(myBankCode);

        if (tx.getType() == TransactionType.DEBIT) {
            r.setSourceAccountNumber(tx.getAccount().getAccountNumber());
            r.setDestinationAccountNumber(tx.getCounterpartAccount());
            r.setSourceBankCode(myBankCode);
            r.setDestBankCode(counterpartBankCode);
        } else {
            r.setSourceAccountNumber(tx.getCounterpartAccount());
            r.setDestinationAccountNumber(tx.getAccount().getAccountNumber());
            r.setSourceBankCode(counterpartBankCode);
            r.setDestBankCode(myBankCode);
        }

        // Direction is relative to the requesting client. CBS rows are
        // single-sided (one row per debit, one per credit), so the entity's
        // own type maps 1:1: DEBIT row = the request owner's account is the
        // source = "DEBIT" for them, CREDIT row = "CREDIT".
        boolean accountMine = myAccountNumbers.contains(tx.getAccount().getAccountNumber());
        boolean counterpartMine = tx.getCounterpartAccount() != null
                && myAccountNumbers.contains(tx.getCounterpartAccount());
        boolean isInternal = accountMine && counterpartMine;
        r.setInternal(isInternal);
        r.setType(tx.getType() == TransactionType.DEBIT ? "DEBIT" : "CREDIT");

        // Counterpart account is the *other* side of the row from the requester's
        // perspective. For a DEBIT on my account, it's where the money went;
        // for a CREDIT, it's where it came from.
        r.setCounterpartAccount(tx.getCounterpartAccount());

        // Best-effort name lookup. Resolve the CBS account → its owner client.
        // Skipped when the row is internal (the counterpart is the user themselves).
        if (!isInternal && tx.getCounterpartAccount() != null) {
            cbsAccountRepository.findByAccountNumber(tx.getCounterpartAccount())
                    .map(CbsAccount::getClient)
                    .ifPresent(other -> {
                        r.setCounterpartName(buildFullName(other));
                        // Username + profile picture live on the PayZo side
                        // (auto-generated at signup), not in CBS — look up
                        // by CIN. Stays null for clients who aren't on
                        // PayZo yet.
                        clientRepository.findByCin(other.getCin())
                                .ifPresent(c -> {
                                    r.setCounterpartUsername(c.getUsername());
                                    r.setCounterpartProfilePictureUrl(c.getProfilePictureUrl());
                                });
                    });
        }

        // Masked accounts for the expanded-row "From / To" cells.
        r.setSourceMaskedAccount(maskAccount(r.getSourceAccountNumber(), r.getSourceBankCode()));
        r.setDestMaskedAccount(maskAccount(r.getDestinationAccountNumber(), r.getDestBankCode()));

        return r;
    }

    /**
     * Populate caller-relative direction + counterpart fields on a payzo_db
     * {@link TransactionResponse}. {@code myAccountNumbers} is whichever set
     * the caller treats as "mine":
     * <ul>
     *   <li>Per-account view → singleton {accountNumber}.
     *   <li>Merged list view → all of the requester's CBS accounts.
     * </ul>
     * Direction is DEBIT when the source side is mine (money out), CREDIT
     * when the destination side is mine (money in). When both ends are mine
     * (rare for {@code transactions} rows since internal transfers go through
     * the D8 endpoint and skip payzo_db, but defensive), we surface
     * {@code internal=true} so the FE renders the "Internal transfer" label
     * with the bidirectional arrow.
     */
    private void enrichPayZoTransactionResponse(TransactionResponse r,
                                                Transaction tx,
                                                Set<String> myAccountNumbers) {
        boolean sourceMine = myAccountNumbers.contains(tx.getSourceAccountNumber());
        boolean destMine = myAccountNumbers.contains(tx.getDestinationAccountNumber());
        boolean isInternal = sourceMine && destMine;
        r.setInternal(isInternal);
        // Default to DEBIT when neither side is mine (shouldn't happen for
        // payzo_db rows reaching this path, but pick a deterministic value).
        r.setType(destMine && !sourceMine ? "CREDIT" : "DEBIT");

        // Counterpart resolution depends on direction.
        if (isInternal) {
            // Internal — the "counterpart" is your other account. Name/username
            // would just be the user themselves; the FE shows "Internal transfer"
            // and never renders these fields, but we still set the account so
            // the expanded row can show "From → To" between two of your accounts.
            r.setCounterpartAccount(tx.getDestinationAccountNumber());
        } else if ("DEBIT".equals(r.getType())) {
            // I sent it. Counterpart = recipient. Look up by destClientCin
            // (snapshotted on the Transaction row at initiation). When the
            // recipient is a CBS-only client (no PayZo account), the PayZo
            // lookup misses — fall back to CBS so the name still resolves
            // and the frontend doesn't render "Unknown". Username + picture
            // stay null because those only live on the PayZo side.
            r.setCounterpartAccount(tx.getDestinationAccountNumber());
            if (tx.getDestClientCin() != null) {
                var payzoClient = clientRepository.findByCin(tx.getDestClientCin());
                if (payzoClient.isPresent()) {
                    Client c = payzoClient.get();
                    r.setCounterpartName(buildFullName(c.getFirstName(), c.getLastName()));
                    r.setCounterpartUsername(c.getUsername());
                    r.setCounterpartProfilePictureUrl(c.getProfilePictureUrl());
                } else {
                    cbsIntegrationService.findClientByCin(tx.getDestClientCin())
                            .ifPresent(cbs -> r.setCounterpartName(
                                    buildFullName(cbs.firstName(), cbs.lastName())));
                }
            }
        } else {
            // I received it. Counterpart = sender. Sender lives on tx.client.
            r.setCounterpartAccount(tx.getSourceAccountNumber());
            Client sender = tx.getClient();
            if (sender != null) {
                r.setCounterpartName(buildFullName(sender.getFirstName(), sender.getLastName()));
                r.setCounterpartUsername(sender.getUsername());
                r.setCounterpartProfilePictureUrl(sender.getProfilePictureUrl());
            }
        }

        // Carry the OTP-confirmation timestamp through to the wire so the
        // expanded-row "OTP confirmed" cell stops rendering "—" for confirmed
        // transfers. The MapStruct mapper auto-fills `executedAt` and
        // `createdAt` already; this one is opt-in.
        r.setOtpConfirmedAt(tx.getOtpConfirmedAt());

        // Canonical "when did this happen" timestamp the FE reads via
        // `tx.timestamp`. Prefer the moment money actually moved
        // (executedAt); fall back to createdAt for rows still pending
        // execution. Without this every row's row-stamp + date grouping
        // collapses to "Invalid Date" because the FE never reads
        // executedAt/createdAt directly.
        r.setTimestamp(tx.getExecutedAt() != null ? tx.getExecutedAt() : tx.getCreatedAt());

        r.setSourceMaskedAccount(maskAccount(tx.getSourceAccountNumber(), tx.getSourceBankCode()));
        r.setDestMaskedAccount(maskAccount(tx.getDestinationAccountNumber(), tx.getDestBankCode()));
    }

    /**
     * "BIAT ••8421" formatter — bank code (or "—" when missing) + last 4
     * digits of the account number. Used by both mapping paths to feed the
     * expanded-row "From / To" cells. Returns {@code null} when there's
     * nothing to mask (caller decides whether to render "—" in that case).
     */
    private static String maskAccount(String accountNumber, String bankCode) {
        if (accountNumber == null || accountNumber.length() < 4) return null;
        String prefix = (bankCode == null || bankCode.isBlank()) ? "—" : bankCode;
        return prefix + " ••" + accountNumber.substring(accountNumber.length() - 4);
    }

    private static String buildFullName(String firstName, String lastName) {
        String f = firstName == null ? "" : firstName.trim();
        String l = lastName == null ? "" : lastName.trim();
        String joined = (f + " " + l).trim();
        return joined.isEmpty() ? null : joined;
    }

    /** Convenience — same as {@link #buildFullName(String, String)} for a CBS client. */
    private static String buildFullName(CbsClient cbs) {
        return buildFullName(cbs.getFirstName(), cbs.getLastName());
    }

    @Transactional(readOnly = true)
    public TransactionResponse getTransferDetail(UUID transactionId, UUID clientId) {
        return transactionRepository.findById(transactionId)
                .filter(tx -> tx.getClient().getId().equals(clientId))
                .map(transactionMapper::toTransactionResponse)
                .orElseThrow(() -> new ResourceNotFoundException("Transaction not found: " + transactionId));
    }

    @Transactional(readOnly = true)
    public Page<AlertResponse> getAlerts(UUID clientId,
                                          AlertStatus status,
                                          RiskLevel risk,
                                          String bankCode,
                                          String period,
                                          String query,
                                          Pageable pageable) {
        Specification<FraudAlert> spec = clientScopedAlertSpec(clientId, status, risk, bankCode, period, query);
        Page<FraudAlert> alerts = fraudAlertRepository.findAll(spec, pageable);

        Map<String, String> nameCache = buildCounterpartNameCache(alerts.getContent());
        return alerts.map(a -> toClientAlertResponse(a, nameCache));
    }

    /**
     * Specification builder shared by the paged listing (D11) and the dashboard
     * summary (D6). All filters are optional — null/blank leaves that dimension
     * wide open. Always anded with {@code transaction.client.id == clientId} so
     * a client never sees another client's alerts.
     */
    private Specification<FraudAlert> clientScopedAlertSpec(UUID clientId,
                                                             AlertStatus status,
                                                             RiskLevel risk,
                                                             String bankCode,
                                                             String period,
                                                             String query) {
        Specification<FraudAlert> spec = (root, cq, cb) ->
                cb.equal(root.get("transaction").get("client").get("id"), clientId);

        if (status != null) {
            spec = spec.and((root, cq, cb) -> cb.equal(root.get("status"), status));
        }
        if (risk != null) {
            spec = spec.and((root, cq, cb) ->
                    cb.equal(root.get("transaction").get("riskLevel"), risk));
        }
        if (bankCode != null && !bankCode.isBlank()) {
            String code = bankCode.trim();
            spec = spec.and((root, cq, cb) -> cb.or(
                    cb.equal(root.get("transaction").get("sourceBankCode"), code),
                    cb.equal(root.get("transaction").get("destBankCode"), code)
            ));
        }
        if (period != null && !period.isBlank()) {
            OffsetDateTime start = PeriodUtils.parsePeriodStart(period);
            if (start != null) {
                spec = spec.and((root, cq, cb) ->
                        cb.greaterThanOrEqualTo(root.get("createdAt"), start));
            }
        }
        if (query != null && !query.isBlank()) {
            String pattern = "%" + query.toLowerCase() + "%";
            spec = spec.and((root, cq, cb) ->
                    cb.like(cb.lower(root.get("transaction").get("reference")), pattern));
        }
        return spec;
    }

    /**
     * Pre-fetches recipient names for a page of alerts in one CBS round-trip
     * per distinct CIN. Cheaper than calling {@link CbsIntegrationService} from
     * the per-row mapper.
     */
    private Map<String, String> buildCounterpartNameCache(List<FraudAlert> alerts) {
        Map<String, String> cache = new HashMap<>();
        for (FraudAlert a : alerts) {
            String cin = a.getTransaction().getDestClientCin();
            if (cin == null || cache.containsKey(cin)) continue;
            try {
                CbsClientData c = cbsIntegrationService.getClientByCin(cin);
                cache.put(cin, c.firstName() + " " + c.lastName());
            } catch (Exception ignored) {
                cache.put(cin, null);
            }
        }
        return cache;
    }

    /**
     * D9 — client-initiated cancel of a PENDING fraud alert. The underlying
     * transaction goes to CANCELLED (the money was never debited from CBS
     * because suspended transfers never reach
     * {@link CbsIntegrationService#executeTransfer}). Distinct from REJECTED,
     * which is reserved for analyst fraud verdicts — the FE renders the two
     * with different pills (neutral grey vs red) per D40.  No trust-score
     * delta is applied per D38. Analyst notifications are not revoked — the
     * alert simply leaves the PENDING-filtered queue once the analyst
     * refreshes.
     */
    @Transactional
    public void cancelOwnAlert(UUID clientId, UUID alertId, String reason) {
        FraudAlert alert = fraudAlertRepository.findById(alertId)
                .filter(a -> clientId.equals(a.getTransaction().getClient().getId()))
                .orElseThrow(() -> new ResourceNotFoundException("Alert not found: " + alertId));

        if (alert.getStatus() != AlertStatus.PENDING) {
            throw new ConflictException("Alert is not in PENDING status", "INVALID_STATUS");
        }

        Transaction tx = alert.getTransaction();
        tx.setStatus(TransactionStatus.CANCELLED);
        transactionRepository.save(tx);

        alert.setStatus(AlertStatus.CANCELLED);
        alert.setAnalystComment(reason != null && !reason.isBlank() ? reason : "Cancelled by client");
        alert.setTrustDelta(0);
        alert.setDecidedAt(OffsetDateTime.now());
        fraudAlertRepository.save(alert);

        auditService.writeLog(clientId, "CLIENT", "ALERT_CANCELLED_BY_CLIENT",
                "FRAUD_ALERT", alertId, reason);

        log.info("Alert cancelled by client: alertId={}, txRef={}", alertId, tx.getReference());
    }

    @Transactional(readOnly = true)
    public ClientAlertSummary getAlertSummary(UUID clientId) {
        Specification<FraudAlert> base =
                clientScopedAlertSpec(clientId, null, null, null, null, null);
        Specification<FraudAlert> pending =
                base.and((root, cq, cb) -> cb.equal(root.get("status"), AlertStatus.PENDING));
        Specification<FraudAlert> rejected =
                base.and((root, cq, cb) -> cb.equal(root.get("status"), AlertStatus.REJECTED));

        Pageable top2 = PageRequest.of(0, 2, Sort.by(Sort.Direction.DESC, "createdAt"));
        Page<FraudAlert> page = fraudAlertRepository.findAll(base, top2);
        Map<String, String> nameCache = buildCounterpartNameCache(page.getContent());
        List<AlertResponse> previews = page.getContent().stream()
                .map(a -> toClientAlertResponse(a, nameCache))
                .toList();

        return ClientAlertSummary.builder()
                .alerts(previews)
                .totalCount(fraudAlertRepository.count(base))
                .underReviewCount(fraudAlertRepository.count(pending))
                .rejectedCount(fraudAlertRepository.count(rejected))
                .build();
    }

    AlertResponse toClientAlertResponse(FraudAlert alert, Map<String, String> nameCache) {
        AlertResponse resp = new AlertResponse();
        resp.setId(alert.getId());
        resp.setTransactionId(alert.getTransaction().getId());
        resp.setTransactionReference(alert.getTransaction().getReference());
        resp.setStatus(ClientAlertStatusMapper.toClient(alert.getStatus()));
        resp.setAmount(alert.getTransaction().getAmount());
        resp.setRiskLevel(alert.getTransaction().getRiskLevel());
        resp.setSourceBankCode(alert.getTransaction().getSourceBankCode());
        resp.setDestBankCode(alert.getTransaction().getDestBankCode());
        resp.setCounterpartName(nameCache.get(alert.getTransaction().getDestClientCin()));
        resp.setMlReasons(alert.getMlReasons());
        resp.setDecisionReason(alert.getAnalystComment());
        resp.setTrustDelta(alert.getTrustDelta());
        resp.setDecidedAt(alert.getDecidedAt());
        resp.setCreatedAt(alert.getCreatedAt());
        return resp;
    }
}
