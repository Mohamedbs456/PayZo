package com.payzo.backend.service.superadmin;

import com.payzo.backend.domain.entity.Bank;
import com.payzo.backend.domain.entity.User;
import com.payzo.backend.domain.enums.Role;
import com.payzo.backend.domain.enums.UserNotificationType;
import com.payzo.backend.repository.BankRepository;
import com.payzo.backend.repository.UserRepository;
import com.payzo.backend.service.audit.AuditService;
import com.payzo.backend.service.integration.CbsIntegrationService;
import com.payzo.backend.service.integration.CbsIntegrationService.CbsBankData;
import com.payzo.backend.service.notification.InAppNotificationService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * Pulls the bank catalog from CBS (D2) and reconciles it into
 * {@code payzo_db.banks}. CBS owns the truth — PayZo opts in by flipping
 * {@link Bank#isActive()}. Sync behaviour:
 *
 * <ul>
 *   <li>New CBS bank → inserted with {@code active=false} (opt-in by SA),
 *       SuperAdmin gets a {@link UserNotificationType#BANK_ADDED} notification.</li>
 *   <li>First-ever run (empty PayZo banks table) → inserted with
 *       {@code active=true} so existing dev behaviour is preserved.</li>
 *   <li>Existing CBS bank → name + numericCode refreshed, {@code bankNameSyncedAt}
 *       bumped.</li>
 *   <li>PayZo bank missing from CBS → force-deactivated via
 *       {@code BankService.deactivateBankAsSystem}; cascade rejects in-progress
 *       transfers and notifies clients. SA gets a
 *       {@link UserNotificationType#BANK_REMOVED_FROM_CBS} notification.</li>
 * </ul>
 *
 * The method is {@code synchronized} — concurrent SA-triggered syncs (e.g. two
 * clicks in a row) can't produce duplicate notifications.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class BankSyncService {

    private final BankRepository bankRepository;
    private final CbsIntegrationService cbsIntegrationService;
    private final UserRepository userRepository;
    private final InAppNotificationService inAppNotificationService;
    private final BankService bankService;
    private final AuditService auditService;

    @Transactional
    public synchronized SyncResult syncFromCbs() {
        boolean firstRun = bankRepository.count() == 0;
        List<CbsBankData> cbsBanks = cbsIntegrationService.listBanks();

        Map<String, Bank> payzoByCode = new HashMap<>();
        for (Bank b : bankRepository.findAll()) {
            payzoByCode.put(b.getCode(), b);
        }

        OffsetDateTime now = OffsetDateTime.now();
        int inserted = 0, refreshed = 0, deactivated = 0;

        Set<String> cbsCodes = cbsBanks.stream()
                .map(CbsBankData::code)
                .collect(Collectors.toSet());

        for (CbsBankData cbsBank : cbsBanks) {
            Bank existing = payzoByCode.get(cbsBank.code());
            if (existing == null) {
                Bank bank = new Bank();
                bank.setCode(cbsBank.code());
                bank.setNumericCode(cbsBank.numericCode());
                bank.setName(cbsBank.name());
                bank.setActive(firstRun);
                bank.setBankNameSyncedAt(now);
                bankRepository.save(bank);
                inserted++;

                auditService.writeLog(null, "SYSTEM", "BANK_SYNCED_FROM_CBS",
                        "BANK", bank.getId(),
                        "code=" + bank.getCode() + " active=" + firstRun);

                String message = firstRun
                        ? "Bank " + cbsBank.name() + " (" + cbsBank.code() + ") has been registered."
                        : "Bank " + cbsBank.name() + " (" + cbsBank.code() + ") is awaiting your review for activation.";
                notifySuperAdmins(UserNotificationType.BANK_ADDED, "New bank detected", message);
            } else {
                boolean changed = false;
                if (!Objects.equals(existing.getName(), cbsBank.name())) {
                    existing.setName(cbsBank.name());
                    changed = true;
                }
                if (!Objects.equals(existing.getNumericCode(), cbsBank.numericCode())) {
                    existing.setNumericCode(cbsBank.numericCode());
                    changed = true;
                }
                existing.setBankNameSyncedAt(now);
                bankRepository.save(existing);
                if (changed) refreshed++;
            }
        }

        for (Bank payzoBank : payzoByCode.values()) {
            if (cbsCodes.contains(payzoBank.getCode())) continue;
            if (payzoBank.isActive()) {
                bankService.deactivateBankAsSystem(payzoBank.getId());
                deactivated++;
            }
            notifySuperAdmins(UserNotificationType.BANK_REMOVED_FROM_CBS,
                    "Bank removed from CBS",
                    "Bank " + payzoBank.getName() + " (" + payzoBank.getCode()
                            + ") is no longer in the CBS catalog and has been auto-deactivated.");
        }

        log.info("BankSync complete: firstRun={} inserted={} refreshed={} deactivated={}",
                firstRun, inserted, refreshed, deactivated);
        return new SyncResult(firstRun, inserted, refreshed, deactivated);
    }

    /** SuperAdmin-only fan-out (tighter than BankService.notifyBackoffice — no Admins). */
    private void notifySuperAdmins(UserNotificationType type, String title, String message) {
        List<User> superAdmins = userRepository.findByRole(Role.SUPERADMIN);
        for (User sa : superAdmins) {
            inAppNotificationService.create(sa.getId(), title, message, type);
        }
    }

    public record SyncResult(boolean firstRun, int inserted, int refreshed, int deactivated) {}
}
