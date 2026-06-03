package com.payzo.backend.service.client;

import com.payzo.backend.domain.entity.*;
import com.payzo.backend.domain.enums.*;
import com.payzo.backend.dto.client.ClientProfile;
import com.payzo.backend.dto.request.client.BeneficiaryCreateRequest;
import com.payzo.backend.dto.request.client.InternalTransferRequest;
import com.payzo.backend.dto.request.client.TransferRequest;
import com.payzo.backend.dto.response.client.InternalTransferResponse;
import com.payzo.backend.exception.AccountBlockedException;
import com.payzo.backend.exception.ConflictException;
import com.payzo.backend.exception.ResourceNotFoundException;
import com.payzo.backend.exception.ValidationException;
import com.payzo.backend.repository.*;
import com.payzo.backend.service.audit.AuditService;
import com.payzo.backend.service.auth.OtpService;
import com.payzo.backend.service.fraud.FraudDetectionService;
import com.payzo.backend.service.fraud.FraudDetectionService.ScoringResult;
import com.payzo.backend.service.integration.CbsIntegrationService;
import com.payzo.backend.service.integration.CbsIntegrationService.CbsAccountData;
import com.payzo.backend.service.integration.CbsIntegrationService.CbsClientData;
import com.payzo.backend.service.integration.CbsIntegrationService.CbsTransferResult;
import com.payzo.backend.service.notification.InAppNotificationService;
import com.payzo.backend.service.notification.NotificationService;
import com.payzo.backend.util.NameMatcher;
import com.payzo.backend.util.RibValidator;
import com.payzo.backend.util.TransactionReferenceGenerator;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

/**
 * P2P transfer pipeline. Three mutually-exclusive recipient resolution modes
 * accepted at the entry endpoint:
 * <ul>
 *   <li><b>Saved beneficiary</b> ({@code beneficiaryId}) — load the saved row;
 *       name already verified at create time, no re-verify here.</li>
 *   <li><b>PayZo username</b> ({@code payzoUsername}, D53) — load the recipient
 *       Client by username, resolve to their {@code defaultAccountId}; name is
 *       identity-proven by the username itself, no re-verify here.</li>
 *   <li><b>Manual RIB+name</b> ({@code destRib + destFirstName + destLastName}) —
 *       only path that supports non-PayZo recipients. Server-side name
 *       re-verification against CBS is mandatory (defence-in-depth — the
 *       client-side {@code /verify-name} call is for UX, this one is
 *       authoritative).</li>
 * </ul>
 *
 * <p>Pipeline after resolution:
 * <ol>
 *   <li>Validate dest + source RIB (mod-97), self-transfer rejection.</li>
 *   <li>Resolve dest bank by RIB's numeric prefix → must be active in PayZo's
 *       activation table.</li>
 *   <li>Standard guardrails: no concurrent in-progress transfer, sender ACTIVE,
 *       source bank active, balance ≥ amount, snapshot balances.</li>
 *   <li>Persist {@code Transaction(PENDING_OTP)}, dispatch OTP.</li>
 *   <li>On OTP confirm → score → LOW = execute in CBS + dispatch notifications +
 *       record beneficiary usage. MED/HIGH = create FraudAlert.</li>
 * </ol>
 *
 * <p>Post-APPROVED dispatch (receiver notification + beneficiary upsert) is
 * wrapped in a try/catch — CBS already committed in its own transaction
 * manager, so a failure here must NOT roll back the PayZo transaction row
 * (split-brain prevention).
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class TransferService {

    private final TransactionRepository transactionRepository;
    private final ClientRepository clientRepository;
    private final BankRepository bankRepository;
    private final BeneficiaryRepository beneficiaryRepository;
    private final BeneficiaryService beneficiaryService;
    private final FraudAlertRepository fraudAlertRepository;
    private final UserRepository userRepository;
    private final CbsIntegrationService cbsIntegrationService;
    private final FraudDetectionService fraudDetectionService;
    private final OtpService otpService;
    private final NotificationService notificationService;
    private final InAppNotificationService inAppNotificationService;
    private final AuditService auditService;
    private final TransactionReferenceGenerator referenceGenerator;
    private final TrustScoreService trustScoreService;
    private final ClientProfileService clientProfileService;

    @Value("${payzo.client.signup-url:http://localhost:5173/signup}")
    private String clientSignupUrl;

    @Transactional
    public UUID initiateTransfer(UUID clientId, TransferRequest request) {
        // Step 0 — resolve recipient: saved beneficiary, PayZo username (D53),
        // or manual RIB+name. The first two are "trusted name" paths (no server-side
        // re-verify at step 6); the last is "name typed by sender" and re-verified.
        RecipientContext ctx = resolveRecipient(clientId, request);
        String destRib = ctx.destRib();
        String destFirstName = ctx.destFirstName();
        String destLastName = ctx.destLastName();
        boolean trustsName = ctx.trustsName();

        if (!RibValidator.isValid(destRib)) {
            throw new ValidationException("Invalid destination RIB", "INVALID_RIB");
        }
        if (!RibValidator.isValid(request.getSourceAccountNumber())) {
            throw new ValidationException("Invalid source RIB", "INVALID_RIB");
        }
        if (request.getSourceAccountNumber().equals(destRib)) {
            throw new ValidationException("Source and destination must differ", "CANNOT_TRANSFER_TO_SELF");
        }

        // Step 1 — no concurrent in-progress transfer
        boolean hasInProgress = transactionRepository.existsByClientIdAndStatusIn(
                clientId, List.of(TransactionStatus.PENDING_OTP, TransactionStatus.PENDING_SCORING));
        if (hasInProgress) {
            throw new ConflictException(
                    "A transfer is already in progress. Complete or cancel it first.",
                    "TRANSFER_ALREADY_IN_PROGRESS");
        }

        // Step 2 — sender must be ACTIVE
        Client client = clientRepository.findById(clientId)
                .orElseThrow(() -> new ResourceNotFoundException("Client not found: " + clientId));
        if (client.getStatus() != UserStatus.ACTIVE) {
            throw new AccountBlockedException("Your account is not active");
        }

        // Step 3 — fetch source from CBS, assert ownership
        CbsAccountData sourceAccount = cbsIntegrationService.getAccountByNumber(request.getSourceAccountNumber());
        if (!client.getCin().equals(sourceAccount.clientCin())) {
            throw new ConflictException("Source account does not belong to you", "ACCOUNT_MISMATCH");
        }

        // Step 4 — source bank active
        Bank sourceBank = bankRepository.findByCode(sourceAccount.bankCode())
                .orElseThrow(() -> new ResourceNotFoundException("Source bank not found: " + sourceAccount.bankCode()));
        if (!sourceBank.isActive()) {
            throw new ConflictException("Source bank is currently deactivated", "BANK_DEACTIVATED");
        }

        // Step 5 — dest bank lookup via RIB's numeric prefix + active check
        CbsAccountData destAccount = cbsIntegrationService.getAccountByNumber(destRib);
        String destNumericCode = RibValidator.extractNumericBankCode(destRib);
        Bank destBank = bankRepository.findAll().stream()
                .filter(b -> destNumericCode.equals(b.getNumericCode()))
                .findFirst()
                .orElseThrow(() -> new ValidationException(
                        "Destination bank (numeric code " + destNumericCode + ") is not registered",
                        "BANK_NOT_REGISTERED"));
        if (!destBank.isActive()) {
            throw new ConflictException(
                    "Transfers to " + destBank.getName() + " are not currently supported",
                    "BANK_INACTIVE");
        }

        // Step 6 — server-side name re-verification (skip when name is already trusted:
        // saved beneficiary or PayZo username path).
        if (!trustsName) {
            CbsClientData destHolder = cbsIntegrationService.getClientByCin(destAccount.clientCin());
            if (!NameMatcher.matches(destFirstName, destHolder.firstName())
                    || !NameMatcher.matches(destLastName, destHolder.lastName())) {
                throw new ValidationException(
                        "The first and last name don't match the account holder", "NAME_MISMATCH");
            }
        }

        // Step 7 — balance check
        if (sourceAccount.balance().compareTo(request.getAmount()) < 0) {
            throw new ConflictException("Insufficient balance", "INSUFFICIENT_BALANCE");
        }

        // Step 8 — snapshot + persist transaction PENDING_OTP
        Transaction tx = new Transaction();
        tx.setReference(referenceGenerator.generate());
        tx.setClient(client);
        tx.setSourceAccountNumber(request.getSourceAccountNumber());
        tx.setDestinationAccountNumber(destRib);
        tx.setSourceBankCode(sourceAccount.bankCode());
        tx.setDestBankCode(destBank.getCode());
        tx.setAmount(request.getAmount());
        tx.setMotif(request.getMotif());
        tx.setStatus(TransactionStatus.PENDING_OTP);
        tx.setSourceBalanceBefore(sourceAccount.balance());
        tx.setDestBalanceBefore(destAccount.balance());
        tx.setDestClientCin(destAccount.clientCin());

        try {
            transactionRepository.saveAndFlush(tx);
        } catch (DataIntegrityViolationException e) {
            throw new ConflictException(
                    "A transfer is already in progress. Complete or cancel it first.",
                    "TRANSFER_ALREADY_IN_PROGRESS");
        }

        // Step 9 — eagerly create the beneficiary if requested. Only applies to the
        // manual RIB+name path (saved-beneficiary path already has a row; username
        // path doesn't carry a user-typed nickname, recordUsage at APPROVED creates
        // a vanilla row from CBS names).
        if (Boolean.TRUE.equals(request.getSaveBeneficiary()) && !trustsName) {
            try {
                BeneficiaryCreateRequest bcr = new BeneficiaryCreateRequest();
                bcr.setRib(destRib);
                bcr.setFirstName(destFirstName);
                bcr.setLastName(destLastName);
                bcr.setNickname(request.getBeneficiaryNickname());
                beneficiaryService.create(clientId, bcr);
            } catch (Exception e) {
                log.debug("Eager beneficiary save skipped: {}", e.getMessage());
            }
        }

        // Step 10 — generate + dispatch OTP
        ClientProfile profile = clientProfileService.forClient(client);
        otpService.generate(client.getCin(), OtpPurpose.TRANSFER_CONFIRMATION,
                profile.email(), profile.phone());

        log.info("Transfer initiated: txId={} ref={} amount={} trustsName={}",
                tx.getId(), tx.getReference(), request.getAmount(), trustsName);
        return tx.getId();
    }

    /**
     * Resolves the three input shapes (beneficiaryId / payzoUsername / manual triple)
     * to a uniform {@link RecipientContext}. Throws early on self-transfer (username
     * path), missing default account (username path), or unknown saved beneficiary.
     * The {@code trustsName} flag governs whether step 6 re-verifies the name against CBS.
     */
    private RecipientContext resolveRecipient(UUID clientId, TransferRequest request) {
        if (request.getBeneficiaryId() != null) {
            Beneficiary saved = beneficiaryRepository
                    .findByIdAndClientId(request.getBeneficiaryId(), clientId)
                    .orElseThrow(() -> new ResourceNotFoundException("Beneficiary not found"));
            return new RecipientContext(
                    saved.getAccountNumber(),
                    saved.getCachedFirstName(),
                    saved.getCachedLastName(),
                    true);
        }

        String typedUsername = request.getPayzoUsername();
        if (typedUsername != null && !typedUsername.isBlank()) {
            String username = typedUsername.trim();
            if (username.startsWith("@")) username = username.substring(1);

            User user = userRepository.findByUsername(username)
                    .orElseThrow(() -> new ResourceNotFoundException("No PayZo user with this username"));
            if (!(user instanceof Client recipient) || recipient.getStatus() != UserStatus.ACTIVE) {
                throw new ResourceNotFoundException("No PayZo user with this username");
            }
            if (recipient.getId().equals(clientId)) {
                throw new ValidationException("You cannot transfer to yourself", "CANNOT_TRANSFER_TO_SELF");
            }

            String rib = recipient.getDefaultAccountId();
            if (rib == null || rib.isBlank()) {
                throw new ConflictException(
                        "Recipient has no default account",
                        "RECIPIENT_NO_DEFAULT_ACCOUNT");
            }
            return new RecipientContext(
                    rib,
                    recipient.getFirstName(),
                    recipient.getLastName(),
                    true);
        }

        // Manual path — RibValidator.isValid is run by the caller after this returns.
        return new RecipientContext(
                RibValidator.normalize(request.getDestRib()),
                request.getDestFirstName(),
                request.getDestLastName(),
                false);
    }

    /** Uniform recipient resolution result — {@code trustsName} = skip name re-verify. */
    private record RecipientContext(String destRib, String destFirstName, String destLastName,
                                    boolean trustsName) {}

    /**
     * Re-issue a fresh OTP for a transfer that's still PENDING_OTP. The 60s
     * rate-limit and "invalidate prior token" semantics live in OtpService;
     * this method just resolves the right CIN + email + phone for the
     * transaction's owner and delegates.
     *
     * @throws ResourceNotFoundException if the transaction doesn't exist or
     *         belongs to a different client (404 — uniform, no enumeration).
     * @throws ConflictException if the transaction is past PENDING_OTP
     *         (already confirmed, expired, or rejected — resending makes no
     *         sense at that point).
     */
    @Transactional
    public void resendTransferOtp(UUID transactionId, UUID clientId) {
        Transaction tx = transactionRepository.findById(transactionId)
                .orElseThrow(() -> new ResourceNotFoundException("Transaction not found: " + transactionId));

        if (!tx.getClient().getId().equals(clientId)) {
            throw new ResourceNotFoundException("Transaction not found: " + transactionId);
        }

        if (tx.getStatus() != TransactionStatus.PENDING_OTP) {
            throw new ConflictException(
                    "Transaction is not awaiting OTP confirmation", "INVALID_STATUS");
        }

        Client client = tx.getClient();
        ClientProfile profile = clientProfileService.forClient(client);
        otpService.resend(client.getCin(), OtpPurpose.TRANSFER_CONFIRMATION,
                profile.email(), profile.phone());

        log.info("Transfer OTP resent: txId={} clientId={}", transactionId, clientId);
    }

    @Transactional
    public void confirmTransfer(UUID transactionId, String otpCode, UUID clientId) {
        Transaction tx = transactionRepository.findById(transactionId)
                .orElseThrow(() -> new ResourceNotFoundException("Transaction not found: " + transactionId));

        if (!tx.getClient().getId().equals(clientId)) {
            throw new ResourceNotFoundException("Transaction not found: " + transactionId);
        }

        if (tx.getStatus() != TransactionStatus.PENDING_OTP) {
            throw new ConflictException("Transaction is not awaiting OTP confirmation", "INVALID_STATUS");
        }

        Client client = tx.getClient();
        otpService.validate(client.getCin(), OtpPurpose.TRANSFER_CONFIRMATION, otpCode);

        tx.setStatus(TransactionStatus.PENDING_SCORING);
        tx.setOtpConfirmedAt(OffsetDateTime.now());
        transactionRepository.save(tx);

        ScoringResult result = fraudDetectionService.score(tx);
        tx.setRiskScore(result.riskScore());
        tx.setRiskLevel(result.riskLevel());
        transactionRepository.save(tx);

        if (result.riskLevel() == RiskLevel.LOW) {
            executeTransfer(tx);
        } else {
            suspendTransfer(tx, result.reasons());
        }
    }

    /**
     * D8 — between-my-accounts transfer. Same defensive checks as the regular
     * pipeline (RIB validation, ownership, banks active, balance) but no OTP,
     * no ML, no FraudAlert, no row in {@code payzo_db.transactions}.
     */
    @Transactional
    public InternalTransferResponse executeInternal(UUID clientId, InternalTransferRequest req) {
        if (!RibValidator.isValid(req.getSourceAccountNumber())
                || !RibValidator.isValid(req.getDestAccountNumber())) {
            throw new ValidationException("RIB must be 20 digits with a valid mod-97 check", "INVALID_RIB");
        }

        Client client = clientRepository.findById(clientId)
                .orElseThrow(() -> new ResourceNotFoundException("Client not found: " + clientId));
        if (client.getStatus() != UserStatus.ACTIVE) {
            throw new AccountBlockedException("Your account is not active");
        }

        CbsAccountData source = cbsIntegrationService.getAccountByNumber(req.getSourceAccountNumber());
        CbsAccountData dest = cbsIntegrationService.getAccountByNumber(req.getDestAccountNumber());
        if (!client.getCin().equals(source.clientCin())) {
            throw new ConflictException("Source account does not belong to you", "ACCOUNT_MISMATCH");
        }
        if (!client.getCin().equals(dest.clientCin())) {
            throw new ConflictException("Destination account does not belong to you", "ACCOUNT_MISMATCH");
        }

        Bank sourceBank = bankRepository.findByCode(source.bankCode())
                .orElseThrow(() -> new ResourceNotFoundException("Source bank not found: " + source.bankCode()));
        if (!sourceBank.isActive()) {
            throw new ConflictException("Source bank is currently deactivated", "BANK_DEACTIVATED");
        }
        Bank destBank = bankRepository.findByCode(dest.bankCode())
                .orElseThrow(() -> new ResourceNotFoundException("Destination bank not found: " + dest.bankCode()));
        if (!destBank.isActive()) {
            throw new ConflictException("Destination bank is currently deactivated", "BANK_DEACTIVATED");
        }

        if (source.balance().compareTo(req.getAmount()) < 0) {
            throw new ConflictException("Insufficient balance", "INSUFFICIENT_BALANCE");
        }

        String reference = referenceGenerator.generate();
        CbsTransferResult result = cbsIntegrationService.executeTransfer(
                req.getSourceAccountNumber(), req.getDestAccountNumber(),
                req.getAmount(), reference);

        auditService.writeLog(clientId, "CLIENT", "INTERNAL_TRANSFER",
                "CBS_TRANSACTION", null,
                "ref=" + reference + " amount=" + req.getAmount());

        log.info("Internal transfer executed: clientId={}, ref={}, amount={}",
                clientId, reference, req.getAmount());

        return InternalTransferResponse.builder()
                .reference(reference)
                .newSourceBalance(result.newSourceBalance())
                .newDestBalance(result.newDestBalance())
                .build();
    }

    private void executeTransfer(Transaction tx) {
        cbsIntegrationService.executeTransfer(
                tx.getSourceAccountNumber(), tx.getDestinationAccountNumber(),
                tx.getAmount(), tx.getReference());

        tx.setStatus(TransactionStatus.APPROVED);
        tx.setExecutedAt(OffsetDateTime.now());
        transactionRepository.save(tx);

        // Trust score: receiver +1 on LOW auto-approved transfer (D38)
        trustScoreService.onLowAutoApproved(tx.getDestClientCin(), tx.getId());

        Client sender = tx.getClient();
        inAppNotificationService.create(sender.getId(), "Transfer approved",
                "Your transfer " + tx.getReference() + " of " + tx.getAmount() + " TND has been approved.",
                UserNotificationType.TRX_APPROVED);

        ClientProfile senderProfile = clientProfileService.forClient(sender);
        notificationService.send("TRANSFER_APPROVED", senderProfile.email(), senderProfile.phone(),
                Map.of("reference", tx.getReference(), "amount", tx.getAmount()));

        // ── Receiver notification + beneficiary upsert ────────────────────────
        // CBS already committed; never let a downstream failure roll back the
        // PayZo Transaction row (split-brain prevention).
        try {
            dispatchReceiverSideEffects(tx, sender);
        } catch (Exception e) {
            log.warn("Post-transfer side effects failed for tx {}: {}", tx.getId(), e.getMessage(), e);
        }

        auditService.writeLog(sender.getId(), "CLIENT", "TRANSFER_EXECUTED",
                "TRANSACTION", tx.getId(), null);

        log.info("Transfer executed: txId={}, ref={}", tx.getId(), tx.getReference());
    }

    /**
     * Receiver-side fan-out + beneficiary usage record. Pulls the dest holder's
     * canonical name from CBS so cached beneficiary names always match the
     * source of truth, and resolves the receiver's email from {@link Client}
     * (PayZo) or {@link CbsClientData} (non-PayZo) accordingly.
     */
    private void dispatchReceiverSideEffects(Transaction tx, Client sender) {
        String senderDisplayName = (sender.getFirstName() + " " + sender.getLastName()).trim();
        Optional<Client> receiverPayZo = clientRepository.findByCin(tx.getDestClientCin());
        CbsClientData destHolder = cbsIntegrationService.getClientByCin(tx.getDestClientCin());

        if (receiverPayZo.isPresent()) {
            Client receiver = receiverPayZo.get();
            inAppNotificationService.create(
                    receiver.getId(),
                    "Transfer received",
                    "You received " + tx.getAmount() + " TND from " + senderDisplayName + ".",
                    UserNotificationType.TRX_RECEIVED);

            ClientProfile receiverProfile = clientProfileService.forClient(receiver);
            notificationService.send("TRANSFER_RECEIVED",
                    receiverProfile.email(), receiverProfile.phone(),
                    Map.of("amount", tx.getAmount(),
                           "sender", senderDisplayName,
                           "joinCta", false));
        } else if (destHolder.email() != null) {
            notificationService.send("TRANSFER_RECEIVED",
                    destHolder.email(), null,
                    Map.of("amount", tx.getAmount(),
                           "sender", senderDisplayName,
                           "joinCta", true,
                           "signupUrl", clientSignupUrl));
        }

        beneficiaryService.recordUsage(
                sender.getId(),
                tx.getDestinationAccountNumber(),
                destHolder.firstName(),
                destHolder.lastName(),
                tx.getDestBankCode(),
                false,
                null);
    }

    private void suspendTransfer(Transaction tx, List<String> mlReasons) {
        FraudAlert alert = new FraudAlert();
        alert.setTransaction(tx);
        alert.setStatus(AlertStatus.PENDING);
        alert.setMlReasons(mlReasons == null || mlReasons.isEmpty() ? null : List.copyOf(mlReasons));
        fraudAlertRepository.save(alert);

        tx.setStatus(TransactionStatus.SUSPENDED_PENDING_ANALYST);
        transactionRepository.save(tx);

        List<User> analysts = userRepository.findByRole(Role.ANALYST);
        for (User analyst : analysts) {
            inAppNotificationService.create(analyst.getId(), "New fraud alert",
                    "Transaction " + tx.getReference() + " flagged with risk level " + tx.getRiskLevel(),
                    UserNotificationType.FRAUD_ALERT_PENDING);
        }

        Client client = tx.getClient();
        inAppNotificationService.create(client.getId(), "Transfer under review",
                "Your transfer " + tx.getReference() + " is under review by our fraud team.",
                UserNotificationType.TRX_REJECTED);

        auditService.writeLog(client.getId(), "CLIENT", "FRAUD_ALERT_CREATED",
                "TRANSACTION", tx.getId(), "riskLevel=" + tx.getRiskLevel());

        log.info("Transfer suspended: txId={}, ref={}, riskLevel={}",
                tx.getId(), tx.getReference(), tx.getRiskLevel());
    }
}
