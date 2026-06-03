package com.payzo.backend.service.superadmin;

import com.payzo.backend.domain.entity.Bank;
import com.payzo.backend.domain.entity.Transaction;
import com.payzo.backend.domain.entity.User;
import com.payzo.backend.domain.enums.Role;
import com.payzo.backend.domain.enums.TransactionStatus;
import com.payzo.backend.domain.enums.UserNotificationType;
import com.payzo.backend.dto.response.superadmin.BankResponse;
import com.payzo.backend.exception.ConflictException;
import com.payzo.backend.exception.ResourceNotFoundException;
import com.payzo.backend.mapper.BankMapper;
import com.payzo.backend.repository.BankRepository;
import com.payzo.backend.repository.TransactionRepository;
import com.payzo.backend.repository.UserRepository;
import com.payzo.backend.dto.client.ClientProfile;
import com.payzo.backend.service.audit.AuditService;
import com.payzo.backend.service.client.ClientProfileService;
import com.payzo.backend.service.notification.InAppNotificationService;
import com.payzo.backend.service.notification.NotificationService;
import com.payzo.backend.util.SearchSpecification;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;
import java.util.stream.Stream;

/**
 * Read + lifecycle policy operations on {@link Bank}. Bank rows themselves are
 * created exclusively by {@code BankSyncService} from CBS — this service owns
 * the operations a SuperAdmin can run on already-synced rows: activate /
 * deactivate (with cascade rejection of in-progress transfers) and a logo-only
 * update. There is no createBank/updateBank/deleteBank surface here — CBS is
 * the authoritative catalog.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class BankService {

    private final BankRepository bankRepository;
    private final TransactionRepository transactionRepository;
    private final UserRepository userRepository;
    private final NotificationService notificationService;
    private final InAppNotificationService inAppNotificationService;
    private final AuditService auditService;
    private final BankMapper bankMapper;
    private final ClientProfileService clientProfileService;

    @Transactional(readOnly = true)
    public Page<BankResponse> getAllBanks(String query, Pageable pageable) {
        Specification<Bank> spec = SearchSpecification.build(query,
                new String[]{"name", "code"}, Map.of());
        return bankRepository.findAll(spec, pageable)
                .map(bankMapper::toBankResponse);
    }

    @Transactional(readOnly = true)
    public BankResponse getBank(UUID id) {
        Bank bank = bankRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Bank not found: " + id));
        return bankMapper.toBankResponse(bank);
    }

    @Transactional
    public BankResponse updateBankLogo(UUID id, String logoUrl, UUID superAdminId) {
        Bank bank = bankRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Bank not found: " + id));

        bank.setLogoUrl(logoUrl);
        bankRepository.save(bank);

        auditService.writeLog(superAdminId, "SUPERADMIN", "BANK_LOGO_UPDATED",
                "BANK", bank.getId(), "code=" + bank.getCode());

        log.info("Updated bank logo: id={}, code={}", id, bank.getCode());
        return bankMapper.toBankResponse(bank);
    }

    @Transactional
    public void deactivateBank(UUID id, UUID superAdminId) {
        Bank bank = bankRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Bank not found: " + id));

        if (!bank.isActive()) {
            throw new ConflictException("Bank is already deactivated", "ALREADY_DEACTIVATED");
        }

        runDeactivationCascade(bank, superAdminId, "SUPERADMIN");
    }

    /**
     * System-initiated deactivation — fired by {@code BankSyncService} when a
     * PayZo bank disappears from the CBS catalog. Same cascade as the SA-driven
     * path, just no SA actor in the audit trail.
     */
    @Transactional
    public void deactivateBankAsSystem(UUID id) {
        Bank bank = bankRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Bank not found: " + id));

        if (!bank.isActive()) {
            log.debug("System deactivation skipped — bank {} already inactive", bank.getCode());
            return;
        }

        runDeactivationCascade(bank, null, "SYSTEM");
    }

    @Transactional
    public void activateBank(UUID id, UUID superAdminId) {
        Bank bank = bankRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Bank not found: " + id));

        if (bank.isActive()) {
            throw new ConflictException("Bank is already active", "ALREADY_ACTIVE");
        }

        bank.setActive(true);
        bankRepository.save(bank);

        auditService.writeLog(superAdminId, "SUPERADMIN", "BANK_ACTIVATED",
                "BANK", bank.getId(), "code=" + bank.getCode());

        notifyBackoffice(UserNotificationType.BANK_REACTIVATED,
                "Bank reactivated", "Bank " + bank.getName() + " has been reactivated.");

        log.info("Activated bank: id={}, code={}", id, bank.getCode());
    }

    /**
     * Shared cascade: flips {@code active=false}, rejects every in-progress
     * transfer touching this bank's code on either side, notifies the affected
     * clients exactly once, and records an audit log entry. Used by both the
     * SA-triggered and system-triggered deactivation paths.
     */
    private void runDeactivationCascade(Bank bank, UUID actorId, String actorRole) {
        bank.setActive(false);
        bankRepository.save(bank);

        // D7: every in-progress transfer touching this bank is auto-rejected so
        // pending OTPs / scoring / suspended-for-analyst alerts don't outlive the
        // bank's deactivation. Money was never debited (CBS only runs at executeTransfer)
        // so REJECTED is the safe terminal state for the sender.
        List<TransactionStatus> inProgressStatuses = List.of(
                TransactionStatus.PENDING_OTP,
                TransactionStatus.PENDING_SCORING,
                TransactionStatus.SUSPENDED_PENDING_ANALYST);

        List<Transaction> affectedBySource = transactionRepository
                .findBySourceBankCodeAndStatusIn(bank.getCode(), inProgressStatuses);
        List<Transaction> affectedByDest = transactionRepository
                .findByDestBankCodeAndStatusIn(bank.getCode(), inProgressStatuses);

        Set<UUID> notifiedClients = new HashSet<>();

        Stream.concat(affectedBySource.stream(), affectedByDest.stream())
                .distinct()
                .forEach(tx -> {
                    tx.setStatus(TransactionStatus.REJECTED);
                    transactionRepository.save(tx);

                    auditService.writeLog(actorId, actorRole, "TRANSFER_REJECTED_BANK_DEACTIVATED",
                            "TRANSACTION", tx.getId(), "bankCode=" + bank.getCode());

                    UUID clientId = tx.getClient().getId();
                    if (notifiedClients.add(clientId)) {
                        inAppNotificationService.create(clientId, "Bank deactivated",
                                "Bank " + bank.getName() + " has been deactivated. Pending transfers have been cancelled.",
                                UserNotificationType.BANK_DEACTIVATED);

                        ClientProfile profile = clientProfileService.forClient(tx.getClient());
                        notificationService.send("BANK_DEACTIVATED",
                                profile.email(), profile.phone(),
                                Map.of("bankName", bank.getName()));
                    }
                });

        auditService.writeLog(actorId, actorRole, "BANK_DEACTIVATED",
                "BANK", bank.getId(), "code=" + bank.getCode());

        notifyBackoffice(UserNotificationType.BANK_DEACTIVATED,
                "Bank deactivated", "Bank " + bank.getName() + " has been deactivated.");

        log.info("Deactivated bank: id={}, code={}, affectedTransactions={} (actor={})",
                bank.getId(), bank.getCode(), affectedBySource.size() + affectedByDest.size(), actorRole);
    }

    /** SuperAdmin + Admin in-app notification fan-out for shared backoffice events. */
    private void notifyBackoffice(UserNotificationType type, String title, String message) {
        List<User> superAdmins = userRepository.findByRole(Role.SUPERADMIN);
        List<User> admins = userRepository.findByRole(Role.ADMIN);

        for (User sa : superAdmins) {
            inAppNotificationService.create(sa.getId(), title, message, type);
        }
        for (User admin : admins) {
            inAppNotificationService.create(admin.getId(), title, message, type);
        }
    }
}
