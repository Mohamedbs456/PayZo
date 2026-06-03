package com.payzo.backend.service;

import com.payzo.backend.domain.entity.Analyst;
import com.payzo.backend.domain.entity.Client;
import com.payzo.backend.domain.entity.FraudAlert;
import com.payzo.backend.domain.entity.SuperAdmin;
import com.payzo.backend.domain.entity.Transaction;
import com.payzo.backend.domain.enums.AlertStatus;
import com.payzo.backend.domain.enums.RiskLevel;
import com.payzo.backend.domain.enums.TransactionStatus;
import com.payzo.backend.exception.ConflictException;
import com.payzo.backend.exception.ResourceNotFoundException;
import com.payzo.backend.mapper.FraudAlertMapper;
import com.payzo.backend.mapper.UserMapper;
import com.payzo.backend.repository.AuditLogRepository;
import com.payzo.backend.repository.FraudAlertRepository;
import com.payzo.backend.repository.TransactionRepository;
import com.payzo.backend.repository.UserRepository;
import com.payzo.backend.dto.client.ClientProfile;
import com.payzo.backend.service.analyst.AlertService;
import com.payzo.backend.service.audit.AuditService;
import com.payzo.backend.service.client.ClientProfileService;
import com.payzo.backend.service.client.TrustScoreService;
import com.payzo.backend.service.integration.CbsIntegrationService;
import com.payzo.backend.service.integration.CbsIntegrationService.CbsTransferResult;
import com.payzo.backend.service.notification.InAppNotificationService;
import com.payzo.backend.service.notification.NotificationService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class AlertServiceTest {

    @Mock private FraudAlertRepository fraudAlertRepository;
    @Mock private TransactionRepository transactionRepository;
    @Mock private UserRepository userRepository;
    @Mock private AuditLogRepository auditLogRepository;
    @Mock private CbsIntegrationService cbsIntegrationService;
    @Mock private NotificationService notificationService;
    @Mock private InAppNotificationService inAppNotificationService;
    @Mock private AuditService auditService;
    @Mock private TrustScoreService trustScoreService;
    @Mock private ClientProfileService clientProfileService;
    @Mock private FraudAlertMapper fraudAlertMapper;
    @Mock private UserMapper userMapper;

    @InjectMocks
    private AlertService alertService;

    private static final ClientProfile STUB_PROFILE = new ClientProfile(
            UUID.randomUUID(), null, "12345678", "user", "Sara", "Mansouri",
            null, 50, null, null, false,
            "sara@payzo.tn", "+21622145678", null, null, null);

    @BeforeEach
    void setupClientProfileStub() {
        lenient().when(clientProfileService.forClient(any())).thenReturn(STUB_PROFILE);
    }

    // ── approveAlert ──────────────────────────────────────────────────────────

    @Test
    void approveAlert_executesCbsTransfer_andPersistsTrustDeltaForHighRisk() {
        Transaction tx = transactionWith(RiskLevel.HIGH);
        FraudAlert alert = pendingAlert(tx);
        Analyst analyst = analyst();

        when(fraudAlertRepository.findById(alert.getId())).thenReturn(Optional.of(alert));
        when(userRepository.findById(analyst.getId())).thenReturn(Optional.of(analyst));
        when(cbsIntegrationService.executeTransfer(any(), any(), any(), any()))
                .thenReturn(new CbsTransferResult(true, BigDecimal.ZERO, BigDecimal.ZERO));

        alertService.approveAlert(alert.getId(), "Looked legit", analyst.getId());

        // Trust delta = -5 for HIGH approved (D38)
        assertThat(alert.getTrustDelta()).isEqualTo(-5);
        assertThat(alert.getStatus()).isEqualTo(AlertStatus.VALIDATED);
        assertThat(alert.getAnalystComment()).isEqualTo("Looked legit");
        assertThat(alert.getAnalyst()).isEqualTo(analyst);
        assertThat(tx.getStatus()).isEqualTo(TransactionStatus.APPROVED);
        verify(cbsIntegrationService).executeTransfer(any(), any(), any(), any());
        verify(trustScoreService).onAlertOutcome(tx.getDestClientCin(), RiskLevel.HIGH, false, tx.getId());
    }

    @Test
    void approveAlert_appliesMinusOneDelta_forMediumRisk() {
        Transaction tx = transactionWith(RiskLevel.MEDIUM);
        FraudAlert alert = pendingAlert(tx);
        Analyst analyst = analyst();

        when(fraudAlertRepository.findById(alert.getId())).thenReturn(Optional.of(alert));
        when(userRepository.findById(analyst.getId())).thenReturn(Optional.of(analyst));
        when(cbsIntegrationService.executeTransfer(any(), any(), any(), any()))
                .thenReturn(new CbsTransferResult(true, BigDecimal.ZERO, BigDecimal.ZERO));

        alertService.approveAlert(alert.getId(), null, analyst.getId());

        assertThat(alert.getTrustDelta()).isEqualTo(-1);
        assertThat(alert.getAnalystComment()).isNull();
    }

    @Test
    void approveAlert_throwsConflict_whenAlertNotPending() {
        Transaction tx = transactionWith(RiskLevel.HIGH);
        FraudAlert alert = pendingAlert(tx);
        alert.setStatus(AlertStatus.VALIDATED); // already decided

        when(fraudAlertRepository.findById(alert.getId())).thenReturn(Optional.of(alert));

        assertThatThrownBy(() -> alertService.approveAlert(alert.getId(), null, UUID.randomUUID()))
                .isInstanceOf(ConflictException.class)
                .hasMessageContaining("PENDING");

        verify(cbsIntegrationService, never()).executeTransfer(any(), any(), any(), any());
    }

    // ── rejectAlert ───────────────────────────────────────────────────────────

    @Test
    void rejectAlert_persistsMinus10Delta_forHighRisk() {
        Transaction tx = transactionWith(RiskLevel.HIGH);
        FraudAlert alert = pendingAlert(tx);
        Analyst analyst = analyst();

        when(fraudAlertRepository.findById(alert.getId())).thenReturn(Optional.of(alert));
        when(userRepository.findById(analyst.getId())).thenReturn(Optional.of(analyst));

        alertService.rejectAlert(alert.getId(), "Confirmed fraud — destination blacklisted",
                analyst.getId());

        assertThat(alert.getTrustDelta()).isEqualTo(-10);
        assertThat(alert.getStatus()).isEqualTo(AlertStatus.REJECTED);
        assertThat(tx.getStatus()).isEqualTo(TransactionStatus.REJECTED);
        verify(cbsIntegrationService, never()).executeTransfer(any(), any(), any(), any());
        verify(trustScoreService).onAlertOutcome(tx.getDestClientCin(), RiskLevel.HIGH, true, tx.getId());
    }

    @Test
    void rejectAlert_throwsConflict_whenCommentIsBlank() {
        UUID alertId = UUID.randomUUID();

        assertThatThrownBy(() -> alertService.rejectAlert(alertId, "  ", UUID.randomUUID()))
                .isInstanceOf(ConflictException.class)
                .hasMessageContaining("comment");

        verify(fraudAlertRepository, never()).findById(any());
    }

    @Test
    void rejectAlert_throwsConflict_whenCommentIsNull() {
        UUID alertId = UUID.randomUUID();

        assertThatThrownBy(() -> alertService.rejectAlert(alertId, null, UUID.randomUUID()))
                .isInstanceOf(ConflictException.class);
    }

    // ── cancelPending ─────────────────────────────────────────────────────────

    @Test
    void cancelPending_marksTransactionCancelled_withZeroTrustDelta() {
        Transaction tx = transactionWith(RiskLevel.HIGH);
        FraudAlert alert = pendingAlert(tx);
        SuperAdmin sa = new SuperAdmin();
        sa.setId(UUID.randomUUID());
        sa.setFirstName("Super");
        sa.setLastName("Admin");

        when(fraudAlertRepository.findById(alert.getId())).thenReturn(Optional.of(alert));
        when(userRepository.findById(sa.getId())).thenReturn(Optional.of(sa));

        alertService.cancelPending(alert.getId(), sa.getId(), "Stuck since yesterday");

        assertThat(alert.getStatus()).isEqualTo(AlertStatus.CANCELLED);
        assertThat(alert.getTrustDelta()).isEqualTo(0);
        assertThat(alert.getAnalystComment()).isEqualTo("Stuck since yesterday");
        assertThat(tx.getStatus()).isEqualTo(TransactionStatus.CANCELLED);
        verify(trustScoreService, never()).onAlertOutcome(any(), any(), anyBoolean(), any());
    }

    @Test
    void cancelPending_usesDefaultComment_whenReasonBlank() {
        Transaction tx = transactionWith(RiskLevel.MEDIUM);
        FraudAlert alert = pendingAlert(tx);
        SuperAdmin sa = new SuperAdmin();
        sa.setId(UUID.randomUUID());

        when(fraudAlertRepository.findById(alert.getId())).thenReturn(Optional.of(alert));
        when(userRepository.findById(sa.getId())).thenReturn(Optional.of(sa));

        alertService.cancelPending(alert.getId(), sa.getId(), null);

        assertThat(alert.getAnalystComment()).isEqualTo("Cancelled by SuperAdmin");
    }

    @Test
    void cancelPending_throwsResourceNotFound_whenAlertMissing() {
        UUID alertId = UUID.randomUUID();
        when(fraudAlertRepository.findById(alertId)).thenReturn(Optional.empty());

        assertThatThrownBy(() ->
                alertService.cancelPending(alertId, UUID.randomUUID(), "anything"))
                .isInstanceOf(ResourceNotFoundException.class);
    }

    // ── helpers ───────────────────────────────────────────────────────────────

    private Transaction transactionWith(RiskLevel risk) {
        Transaction tx = new Transaction();
        tx.setId(UUID.randomUUID());
        tx.setReference("TRX-20260505-AAAAA");
        tx.setRiskLevel(risk);
        tx.setRiskScore(new BigDecimal("0.85"));
        tx.setAmount(new BigDecimal("5000.00"));
        tx.setStatus(TransactionStatus.SUSPENDED_PENDING_ANALYST);
        tx.setSourceAccountNumber("590010010001");
        tx.setDestinationAccountNumber("590010010002");
        tx.setDestClientCin("12345678");

        Client sender = new Client();
        sender.setId(UUID.randomUUID());
        sender.setCin("87654321");
        sender.setFirstName("Mohamed");
        sender.setLastName("Ben Salem");
        sender.setEmail("sender@payzo.tn");
        tx.setClient(sender);
        return tx;
    }

    private FraudAlert pendingAlert(Transaction tx) {
        FraudAlert alert = new FraudAlert();
        alert.setId(UUID.randomUUID());
        alert.setTransaction(tx);
        alert.setStatus(AlertStatus.PENDING);
        return alert;
    }

    private Analyst analyst() {
        Analyst a = new Analyst();
        a.setId(UUID.randomUUID());
        a.setFirstName("Anya");
        a.setLastName("Lyst");
        return a;
    }
}
