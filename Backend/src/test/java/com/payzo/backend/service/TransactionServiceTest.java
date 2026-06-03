package com.payzo.backend.service;

import com.payzo.backend.domain.entity.Client;
import com.payzo.backend.domain.entity.FraudAlert;
import com.payzo.backend.domain.entity.MlModelConfig;
import com.payzo.backend.domain.entity.Transaction;
import com.payzo.backend.domain.enums.ActiveLayer;
import com.payzo.backend.domain.enums.AlertStatus;
import com.payzo.backend.domain.enums.RiskLevel;
import com.payzo.backend.domain.enums.TransactionStatus;
import com.payzo.backend.dto.response.admin.TransactionDetailResponse;
import com.payzo.backend.exception.ResourceNotFoundException;
import com.payzo.backend.repository.ClientRepository;
import com.payzo.backend.repository.FraudAlertRepository;
import com.payzo.backend.repository.MlModelConfigRepository;
import com.payzo.backend.repository.TransactionRepository;
import com.payzo.backend.service.admin.TransactionService;
import com.payzo.backend.service.integration.CbsIntegrationService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class TransactionServiceTest {

    @Mock private TransactionRepository transactionRepository;
    @Mock private FraudAlertRepository fraudAlertRepository;
    @Mock private MlModelConfigRepository mlModelConfigRepository;
    @Mock private ClientRepository clientRepository;
    @Mock private CbsIntegrationService cbsIntegrationService;

    @InjectMocks
    private TransactionService transactionService;

    // ── getDetail ──────────────────────────────────────────────────────────────

    @Test
    void getDetail_buildsFullPayload_includingMlReasonsAndTrustDelta_whenAlertExists() {
        Transaction tx = transaction();
        FraudAlert alert = alertWithReasons(tx,
                List.of("Amount exceeds 10 000 TND", "Initiated outside daytime hours"),
                -10);
        Client receiver = receiver();

        when(transactionRepository.findById(tx.getId())).thenReturn(Optional.of(tx));
        when(fraudAlertRepository.findAll(any(org.springframework.data.jpa.domain.Specification.class)))
                .thenReturn(List.of(alert));
        when(mlModelConfigRepository.findFirstBy()).thenReturn(Optional.of(mlConfig()));
        when(clientRepository.findByCin(tx.getDestClientCin())).thenReturn(Optional.of(receiver));

        TransactionDetailResponse detail = transactionService.getDetail(tx.getId());

        assertThat(detail.getReference()).isEqualTo(tx.getReference());
        assertThat(detail.getFrom().getName()).isEqualTo("Mohamed Ben Salem");
        assertThat(detail.getFrom().getUsername()).isEqualTo("mohamed.bensalem");
        assertThat(detail.getTo().getName()).isEqualTo("Ahmed Tlili");
        assertThat(detail.getTo().getUsername()).isEqualTo("ahmed.tlili");

        assertThat(detail.getTimeline().getCreatedAt()).isEqualTo(tx.getCreatedAt());
        assertThat(detail.getTimeline().getOtpConfirmedAt()).isEqualTo(tx.getOtpConfirmedAt());
        assertThat(detail.getTimeline().getDecidedAt()).isEqualTo(alert.getDecidedAt());
        assertThat(detail.getTimeline().getSettledAt()).isEqualTo(tx.getExecutedAt());

        assertThat(detail.getMl().getScore()).isEqualByComparingTo(tx.getRiskScore());
        assertThat(detail.getMl().getLevel()).isEqualTo(RiskLevel.HIGH);
        assertThat(detail.getMl().getActiveLayer()).isEqualTo(ActiveLayer.PRIMARY);
        assertThat(detail.getMl().getReasons()).containsExactly(
                "Amount exceeds 10 000 TND", "Initiated outside daytime hours");
        assertThat(detail.getMl().getTrustDelta()).isEqualTo(-10);
    }

    @Test
    void getDetail_returnsEmptyMlReasonsAndNullTrustDelta_whenNoAlertExists() {
        Transaction tx = transaction();
        tx.setStatus(TransactionStatus.APPROVED);

        when(transactionRepository.findById(tx.getId())).thenReturn(Optional.of(tx));
        when(fraudAlertRepository.findAll(any(org.springframework.data.jpa.domain.Specification.class)))
                .thenReturn(List.of());
        when(mlModelConfigRepository.findFirstBy()).thenReturn(Optional.of(mlConfig()));

        TransactionDetailResponse detail = transactionService.getDetail(tx.getId());

        assertThat(detail.getMl().getReasons()).isEmpty();
        assertThat(detail.getMl().getTrustDelta()).isNull();
        assertThat(detail.getTimeline().getDecidedAt()).isNull();
    }

    @Test
    void getDetail_falls_backToOnlyAccountInfo_whenReceiverNotInPayZoAndCbsFails() {
        Transaction tx = transaction();
        tx.setStatus(TransactionStatus.APPROVED);

        when(transactionRepository.findById(tx.getId())).thenReturn(Optional.of(tx));
        when(fraudAlertRepository.findAll(any(org.springframework.data.jpa.domain.Specification.class)))
                .thenReturn(List.of());
        when(mlModelConfigRepository.findFirstBy()).thenReturn(Optional.of(mlConfig()));
        when(clientRepository.findByCin(tx.getDestClientCin())).thenReturn(Optional.empty());
        when(cbsIntegrationService.getClientByCin(any())).thenThrow(new RuntimeException("CBS down"));

        TransactionDetailResponse detail = transactionService.getDetail(tx.getId());

        assertThat(detail.getTo().getName()).isNull();
        assertThat(detail.getTo().getUsername()).isNull();
        assertThat(detail.getTo().getAccountNumber()).isEqualTo(tx.getDestinationAccountNumber());
        assertThat(detail.getTo().getBankCode()).isEqualTo(tx.getDestBankCode());
    }

    @Test
    void getDetail_throwsNotFound_whenTransactionDoesNotExist() {
        UUID id = UUID.randomUUID();
        when(transactionRepository.findById(id)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> transactionService.getDetail(id))
                .isInstanceOf(ResourceNotFoundException.class);
    }

    // ── getDetailByReference ──────────────────────────────────────────────────

    @Test
    void getDetailByReference_resolvesByReferenceString() {
        Transaction tx = transaction();
        tx.setStatus(TransactionStatus.APPROVED);

        when(transactionRepository.findByReference(tx.getReference())).thenReturn(Optional.of(tx));
        when(fraudAlertRepository.findAll(any(org.springframework.data.jpa.domain.Specification.class)))
                .thenReturn(List.of());
        when(mlModelConfigRepository.findFirstBy()).thenReturn(Optional.of(mlConfig()));
        when(clientRepository.findByCin(tx.getDestClientCin())).thenReturn(Optional.of(receiver()));

        TransactionDetailResponse detail = transactionService.getDetailByReference(tx.getReference());

        assertThat(detail.getReference()).isEqualTo(tx.getReference());
    }

    // ── helpers ───────────────────────────────────────────────────────────────

    private Transaction transaction() {
        Transaction tx = new Transaction();
        tx.setId(UUID.randomUUID());
        tx.setReference("TRX-20260505-XYZ12");

        Client sender = new Client();
        sender.setId(UUID.randomUUID());
        sender.setCin("87654321");
        sender.setUsername("mohamed.bensalem");
        sender.setFirstName("Mohamed");
        sender.setLastName("Ben Salem");
        tx.setClient(sender);

        tx.setSourceAccountNumber("590010010001");
        tx.setSourceBankCode("ATB");
        tx.setDestinationAccountNumber("590010010002");
        tx.setDestBankCode("BIAT");
        tx.setDestClientCin("12345678");
        tx.setAmount(new BigDecimal("12000.00"));
        tx.setMotif("Rent payment");
        tx.setRiskScore(new BigDecimal("0.85"));
        tx.setRiskLevel(RiskLevel.HIGH);
        tx.setStatus(TransactionStatus.SUSPENDED_PENDING_ANALYST);
        tx.setCreatedAt(OffsetDateTime.now().minusHours(2));
        tx.setOtpConfirmedAt(OffsetDateTime.now().minusHours(2).plusMinutes(1));
        tx.setExecutedAt(null);
        return tx;
    }

    private FraudAlert alertWithReasons(Transaction tx, List<String> reasons, int trustDelta) {
        FraudAlert alert = new FraudAlert();
        alert.setId(UUID.randomUUID());
        alert.setTransaction(tx);
        alert.setMlReasons(reasons);
        alert.setStatus(AlertStatus.REJECTED);
        alert.setTrustDelta(trustDelta);
        alert.setDecidedAt(OffsetDateTime.now().minusMinutes(10));
        return alert;
    }

    private Client receiver() {
        Client r = new Client();
        r.setId(UUID.randomUUID());
        r.setCin("12345678");
        r.setUsername("ahmed.tlili");
        r.setFirstName("Ahmed");
        r.setLastName("Tlili");
        return r;
    }

    private MlModelConfig mlConfig() {
        MlModelConfig c = new MlModelConfig();
        c.setActiveLayer(ActiveLayer.PRIMARY);
        c.setThresholdLowMedium(new BigDecimal("0.30"));
        c.setThresholdMediumHigh(new BigDecimal("0.70"));
        c.setModelVersion("xgb-v1");
        return c;
    }
}
