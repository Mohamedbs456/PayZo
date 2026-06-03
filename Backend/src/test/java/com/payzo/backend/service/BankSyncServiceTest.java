package com.payzo.backend.service;

import com.payzo.backend.domain.entity.Bank;
import com.payzo.backend.domain.entity.SuperAdmin;
import com.payzo.backend.domain.entity.User;
import com.payzo.backend.domain.enums.Role;
import com.payzo.backend.domain.enums.UserNotificationType;
import com.payzo.backend.repository.BankRepository;
import com.payzo.backend.repository.UserRepository;
import com.payzo.backend.service.audit.AuditService;
import com.payzo.backend.service.integration.CbsIntegrationService;
import com.payzo.backend.service.integration.CbsIntegrationService.CbsBankData;
import com.payzo.backend.service.notification.InAppNotificationService;
import com.payzo.backend.service.superadmin.BankService;
import com.payzo.backend.service.superadmin.BankSyncService;
import com.payzo.backend.service.superadmin.BankSyncService.SyncResult;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class BankSyncServiceTest {

    @Mock private BankRepository bankRepository;
    @Mock private CbsIntegrationService cbsIntegrationService;
    @Mock private UserRepository userRepository;
    @Mock private InAppNotificationService inAppNotificationService;
    @Mock private BankService bankService;
    @Mock private AuditService auditService;

    @InjectMocks
    private BankSyncService syncService;

    private SuperAdmin superAdmin;

    @BeforeEach
    void setUp() {
        superAdmin = new SuperAdmin();
        superAdmin.setId(UUID.randomUUID());
        lenient().when(userRepository.findByRole(Role.SUPERADMIN))
                .thenReturn(List.<User>of(superAdmin));
    }

    @Test
    void firstRun_seedsAllCbsBanksAsActive() {
        when(bankRepository.count()).thenReturn(0L);
        when(bankRepository.findAll()).thenReturn(List.of());
        when(cbsIntegrationService.listBanks()).thenReturn(List.of(
                new CbsBankData("STB", "10", "Société Tunisienne de Banque"),
                new CbsBankData("BIAT", "08", "Banque Internationale Arabe de Tunisie")
        ));

        SyncResult result = syncService.syncFromCbs();

        assertThat(result.firstRun()).isTrue();
        assertThat(result.inserted()).isEqualTo(2);
        assertThat(result.deactivated()).isZero();

        ArgumentCaptor<Bank> saved = ArgumentCaptor.forClass(Bank.class);
        verify(bankRepository, times(2)).save(saved.capture());
        // Both rows must land active=true on first run so existing dev behaviour is preserved.
        assertThat(saved.getAllValues()).allSatisfy(b -> assertThat(b.isActive()).isTrue());

        // SA gets one BANK_ADDED notification per inserted bank.
        verify(inAppNotificationService, times(2))
                .create(eq(superAdmin.getId()), anyString(), anyString(),
                        eq(UserNotificationType.BANK_ADDED));
    }

    @Test
    void subsequentRun_insertsNewCbsBankAsInactive() {
        Bank existing = bank("STB", "10", "Société Tunisienne de Banque", true);
        when(bankRepository.count()).thenReturn(1L);
        when(bankRepository.findAll()).thenReturn(List.of(existing));
        when(cbsIntegrationService.listBanks()).thenReturn(List.of(
                new CbsBankData("STB", "10", "Société Tunisienne de Banque"),
                new CbsBankData("BIAT", "08", "Banque Internationale Arabe de Tunisie") // new
        ));

        SyncResult result = syncService.syncFromCbs();

        assertThat(result.firstRun()).isFalse();
        assertThat(result.inserted()).isEqualTo(1);

        // The new bank must be inserted as inactive (opt-in by SA).
        ArgumentCaptor<Bank> saved = ArgumentCaptor.forClass(Bank.class);
        verify(bankRepository, atLeastOnce()).save(saved.capture());
        Bank newOne = saved.getAllValues().stream()
                .filter(b -> "BIAT".equals(b.getCode()))
                .findFirst().orElseThrow();
        assertThat(newOne.isActive()).isFalse();

        verify(inAppNotificationService).create(
                eq(superAdmin.getId()), anyString(), anyString(),
                eq(UserNotificationType.BANK_ADDED));
    }

    @Test
    void cbsRemoved_forceDeactivatesPayZoBank() {
        Bank stbInPayZo = bank("STB", "10", "STB", true);
        when(bankRepository.count()).thenReturn(1L);
        when(bankRepository.findAll()).thenReturn(List.of(stbInPayZo));
        when(cbsIntegrationService.listBanks()).thenReturn(List.of()); // CBS dropped it

        SyncResult result = syncService.syncFromCbs();

        assertThat(result.deactivated()).isEqualTo(1);
        verify(bankService).deactivateBankAsSystem(stbInPayZo.getId());
        verify(inAppNotificationService).create(
                eq(superAdmin.getId()), anyString(), anyString(),
                eq(UserNotificationType.BANK_REMOVED_FROM_CBS));
    }

    @Test
    void nameDrift_refreshesCachedNameAndStampsSyncedAt() {
        Bank stbInPayZo = bank("STB", "10", "Old name", true);
        when(bankRepository.count()).thenReturn(1L);
        when(bankRepository.findAll()).thenReturn(List.of(stbInPayZo));
        when(cbsIntegrationService.listBanks()).thenReturn(List.of(
                new CbsBankData("STB", "10", "Société Tunisienne de Banque")
        ));

        SyncResult result = syncService.syncFromCbs();

        assertThat(result.refreshed()).isEqualTo(1);
        assertThat(stbInPayZo.getName()).isEqualTo("Société Tunisienne de Banque");
        assertThat(stbInPayZo.getBankNameSyncedAt()).isNotNull();
    }

    @Test
    void idempotent_secondRunWithNoChangesProducesNoNotifications() {
        Bank stb = bank("STB", "10", "Société Tunisienne de Banque", true);
        when(bankRepository.count()).thenReturn(1L);
        when(bankRepository.findAll()).thenReturn(List.of(stb));
        when(cbsIntegrationService.listBanks()).thenReturn(List.of(
                new CbsBankData("STB", "10", "Société Tunisienne de Banque")
        ));

        SyncResult result = syncService.syncFromCbs();

        assertThat(result.inserted()).isZero();
        assertThat(result.refreshed()).isZero();
        assertThat(result.deactivated()).isZero();
        verify(inAppNotificationService, never())
                .create(any(), any(), any(), any(UserNotificationType.class));
    }

    private static Bank bank(String code, String numericCode, String name, boolean active) {
        Bank b = new Bank();
        b.setId(UUID.randomUUID());
        b.setCode(code);
        b.setNumericCode(numericCode);
        b.setName(name);
        b.setActive(active);
        return b;
    }
}
