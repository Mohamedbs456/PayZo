package com.payzo.backend.service;

import com.payzo.backend.domain.entity.Bank;
import com.payzo.backend.domain.entity.Client;
import com.payzo.backend.domain.entity.Transaction;
import com.payzo.backend.domain.enums.TransactionStatus;
import com.payzo.backend.dto.client.ClientProfile;
import com.payzo.backend.mapper.BankMapper;
import com.payzo.backend.repository.BankRepository;
import com.payzo.backend.repository.TransactionRepository;
import com.payzo.backend.repository.UserRepository;
import com.payzo.backend.service.audit.AuditService;
import com.payzo.backend.service.client.ClientProfileService;
import com.payzo.backend.service.notification.InAppNotificationService;
import com.payzo.backend.service.notification.NotificationService;
import com.payzo.backend.service.superadmin.BankService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.util.Collections;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.atLeastOnce;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * D7 cascade: when a bank is deactivated, every PENDING_OTP, PENDING_SCORING, and
 * SUSPENDED_PENDING_ANALYST transaction touching that bank is auto-rejected — the
 * sender's money was never debited so REJECTED is the safe terminal state.
 */
@ExtendWith(MockitoExtension.class)
class BankDeactivationCascadeTest {

    @Mock private BankRepository bankRepository;
    @Mock private TransactionRepository transactionRepository;
    @Mock private UserRepository userRepository;
    @Mock private NotificationService notificationService;
    @Mock private InAppNotificationService inAppNotificationService;
    @Mock private AuditService auditService;
    @Mock private BankMapper bankMapper;
    @Mock private ClientProfileService clientProfileService;

    @InjectMocks
    private BankService bankService;

    private static final ClientProfile STUB_PROFILE = new ClientProfile(
            UUID.randomUUID(), null, "12345678", "user", "Sara", "Mansouri",
            null, 50, null, null, false,
            "sara@payzo.tn", "+21622145678", null, null, null);

    @Test
    void deactivateBank_cascadesAllInProgressStatuses_notJustSuspended() {
        Bank bank = activeBank();
        UUID superAdminId = UUID.randomUUID();

        Transaction pendingOtp     = txWithStatus(TransactionStatus.PENDING_OTP);
        Transaction pendingScoring = txWithStatus(TransactionStatus.PENDING_SCORING);
        Transaction suspended      = txWithStatus(TransactionStatus.SUSPENDED_PENDING_ANALYST);

        when(bankRepository.findById(bank.getId())).thenReturn(Optional.of(bank));
        when(transactionRepository.findBySourceBankCodeAndStatusIn(eq(bank.getCode()), anyList()))
                .thenReturn(List.of(pendingOtp, pendingScoring, suspended));
        when(transactionRepository.findByDestBankCodeAndStatusIn(eq(bank.getCode()), anyList()))
                .thenReturn(List.of());
        when(userRepository.findByRole(any())).thenReturn(Collections.emptyList());
        when(clientProfileService.forClient(any())).thenReturn(STUB_PROFILE);

        bankService.deactivateBank(bank.getId(), superAdminId);

        // Capture the statuses passed to the lookup — must include all three.
        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<TransactionStatus>> statusesCaptor =
                ArgumentCaptor.forClass(List.class);
        verify(transactionRepository, atLeastOnce())
                .findBySourceBankCodeAndStatusIn(eq(bank.getCode()), statusesCaptor.capture());
        assertThat(statusesCaptor.getValue()).containsExactlyInAnyOrder(
                TransactionStatus.PENDING_OTP,
                TransactionStatus.PENDING_SCORING,
                TransactionStatus.SUSPENDED_PENDING_ANALYST);

        // All three got moved to REJECTED.
        assertThat(pendingOtp.getStatus()).isEqualTo(TransactionStatus.REJECTED);
        assertThat(pendingScoring.getStatus()).isEqualTo(TransactionStatus.REJECTED);
        assertThat(suspended.getStatus()).isEqualTo(TransactionStatus.REJECTED);
        assertThat(bank.isActive()).isFalse();
    }

    private Bank activeBank() {
        Bank b = new Bank();
        b.setId(UUID.randomUUID());
        b.setCode("ATB");
        b.setName("Arab Tunisian Bank");
        b.setActive(true);
        return b;
    }

    private Transaction txWithStatus(TransactionStatus status) {
        Transaction tx = new Transaction();
        tx.setId(UUID.randomUUID());
        tx.setStatus(status);
        tx.setReference("TRX-X");
        tx.setAmount(new BigDecimal("500"));

        Client c = new Client();
        c.setId(UUID.randomUUID());
        c.setEmail("c@payzo.tn");
        c.setPhone("+21650000000");
        tx.setClient(c);
        return tx;
    }
}
