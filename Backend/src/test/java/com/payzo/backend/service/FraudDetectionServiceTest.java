package com.payzo.backend.service;

import com.payzo.backend.domain.entity.Beneficiary;
import com.payzo.backend.domain.entity.Client;
import com.payzo.backend.domain.entity.MlModelConfig;
import com.payzo.backend.domain.entity.Transaction;
import com.payzo.backend.domain.enums.RiskLevel;
import com.payzo.backend.domain.enums.TransactionStatus;
import com.payzo.backend.repository.BeneficiaryRepository;
import com.payzo.backend.repository.ClientRepository;
import com.payzo.backend.repository.MlModelConfigRepository;
import com.payzo.backend.repository.TransactionRepository;
import com.payzo.backend.service.fraud.FraudDetectionService;
import com.payzo.backend.service.fraud.FraudDetectionService.ScoringResult;
import com.payzo.backend.service.integration.CbsIntegrationService;
import com.payzo.backend.service.integration.CbsIntegrationService.CbsAccountData;
import com.payzo.backend.service.integration.MlIntegrationService;
import com.payzo.backend.service.integration.MlIntegrationService.MlScoreRequest;
import com.payzo.backend.service.integration.MlIntegrationService.MlScoreResponse;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class FraudDetectionServiceTest {

    @Mock private MlIntegrationService mlIntegrationService;
    @Mock private MlModelConfigRepository mlModelConfigRepository;
    @Mock private TransactionRepository transactionRepository;
    @Mock private ClientRepository clientRepository;
    @Mock private CbsIntegrationService cbsIntegrationService;
    @Mock private BeneficiaryRepository beneficiaryRepository;

    @InjectMocks
    private FraudDetectionService fraudDetectionService;

    private MlModelConfig defaultConfig;

    @BeforeEach
    void setUp() {
        defaultConfig = new MlModelConfig();
        defaultConfig.setThresholdLowMedium(new BigDecimal("0.300"));
        defaultConfig.setThresholdMediumHigh(new BigDecimal("0.700"));
        defaultConfig.setModelVersion("stub-v1");

        when(mlModelConfigRepository.findFirstBy()).thenReturn(Optional.of(defaultConfig));
        when(transactionRepository.findByClientIdAndCreatedAtAfterAndStatusNotIn(
                any(), any(), any())).thenReturn(List.of());
    }

    // ── risk level routing ────────────────────────────────────────────────────

    @Test
    void score_shouldReturnLow_whenRiskScoreIsBelowLowMediumThreshold() {
        stubMlResponse(new BigDecimal("0.10"), "stub-v1");

        ScoringResult result = fraudDetectionService.score(transactionWithAmount("500.00"));

        assertThat(result.riskLevel()).isEqualTo(RiskLevel.LOW);
        assertThat(result.riskScore()).isEqualByComparingTo("0.10");
    }

    @Test
    void score_shouldReturnMedium_whenRiskScoreIsBetweenThresholds() {
        stubMlResponse(new BigDecimal("0.50"), "stub-v1");

        ScoringResult result = fraudDetectionService.score(transactionWithAmount("2500.00"));

        assertThat(result.riskLevel()).isEqualTo(RiskLevel.MEDIUM);
    }

    @Test
    void score_shouldReturnHigh_whenRiskScoreIsAboveMediumHighThreshold() {
        stubMlResponse(new BigDecimal("0.85"), "stub-v1");

        ScoringResult result = fraudDetectionService.score(transactionWithAmount("15000.00"));

        assertThat(result.riskLevel()).isEqualTo(RiskLevel.HIGH);
    }

    @Test
    void score_shouldReturnHigh_whenRiskScoreEqualsHighThreshold() {
        stubMlResponse(new BigDecimal("0.700"), "stub-v1");

        ScoringResult result = fraudDetectionService.score(transactionWithAmount("15000.00"));

        assertThat(result.riskLevel()).isEqualTo(RiskLevel.HIGH);
    }

    // ── feature computation ───────────────────────────────────────────────────

    @Test
    void score_shouldComputeFeatureVectorCorrectly() {
        stubMlResponse(new BigDecimal("0.10"), "stub-v1");

        Transaction tx = transactionWithAmount("1000.00");
        tx.setSourceBalanceBefore(new BigDecimal("5000.00"));
        tx.setDestBalanceBefore(new BigDecimal("200.00"));

        fraudDetectionService.score(tx);

        ArgumentCaptor<MlScoreRequest> captor = ArgumentCaptor.forClass(MlScoreRequest.class);
        verify(mlIntegrationService).score(captor.capture());
        MlScoreRequest req = captor.getValue();

        // logAmount = log(1 + 1000)
        assertThat(req.getLogAmount())
                .isCloseTo(Math.log1p(1000.0), within(0.001));

        // amountToBalanceRatio = 1000 / (5000 + 1)
        assertThat(req.getAmountToBalanceRatio())
                .isCloseTo(1000.0 / 5001.0, within(0.0001));

        // receiver has non-zero balance → flag = 0
        assertThat(req.getIsBalanceZeroReceiver()).isEqualTo(0);

        // no governorate on sender or receiver → distance = 0.0
        assertThat(req.getDistanceKm()).isEqualTo(0.0);

        // no prior transactions
        assertThat(req.getSenderTxCount24h()).isEqualTo(0);
        assertThat(req.getSenderDistinctDest24h()).isEqualTo(0);
        assertThat(req.getSenderAmountSum24h()).isEqualTo(0.0);

        // account created 100 days ago → not a new account
        assertThat(req.getSenderAccountAgeDays()).isGreaterThanOrEqualTo(99);
        assertThat(req.getIsSenderNewAccount()).isEqualTo(0);
    }

    @Test
    void score_shouldFlagIsBalanceZeroReceiver_whenReceiverHasZeroBalance() {
        stubMlResponse(new BigDecimal("0.50"), "stub-v1");

        Transaction tx = transactionWithAmount("500.00");
        tx.setSourceBalanceBefore(new BigDecimal("5000.00"));
        tx.setDestBalanceBefore(BigDecimal.ZERO);

        fraudDetectionService.score(tx);

        ArgumentCaptor<MlScoreRequest> captor = ArgumentCaptor.forClass(MlScoreRequest.class);
        verify(mlIntegrationService).score(captor.capture());

        assertThat(captor.getValue().getIsBalanceZeroReceiver()).isEqualTo(1);
    }

    @Test
    void score_shouldFlagIsSenderNewAccount_whenSenderCreatedWithin30Days() {
        stubMlResponse(new BigDecimal("0.10"), "stub-v1");

        Transaction tx = transactionWithAmount("500.00");
        tx.getClient().setCreatedAt(OffsetDateTime.now().minusDays(10));

        fraudDetectionService.score(tx);

        ArgumentCaptor<MlScoreRequest> captor = ArgumentCaptor.forClass(MlScoreRequest.class);
        verify(mlIntegrationService).score(captor.capture());

        assertThat(captor.getValue().getIsSenderNewAccount()).isEqualTo(1);
        assertThat(captor.getValue().getSenderAccountAgeDays()).isLessThanOrEqualTo(10);
    }

    @Test
    void score_shouldIncludePrior24hVelocity_whenRecentTransactionsExist() {
        stubMlResponse(new BigDecimal("0.50"), "stub-v1");

        Transaction prior1 = transactionWithAmount("300.00");
        prior1.setDestinationAccountNumber("TN59001010");
        prior1.setCreatedAt(OffsetDateTime.now().minusMinutes(30));
        Transaction prior2 = transactionWithAmount("700.00");
        prior2.setDestinationAccountNumber("TN59001020");
        prior2.setCreatedAt(OffsetDateTime.now().minusMinutes(10));

        when(transactionRepository.findByClientIdAndCreatedAtAfterAndStatusNotIn(
                any(), any(), any())).thenReturn(List.of(prior1, prior2));

        Transaction tx = transactionWithAmount("500.00");
        fraudDetectionService.score(tx);

        ArgumentCaptor<MlScoreRequest> captor = ArgumentCaptor.forClass(MlScoreRequest.class);
        verify(mlIntegrationService).score(captor.capture());

        assertThat(captor.getValue().getSenderTxCount24h()).isEqualTo(2);
        assertThat(captor.getValue().getSenderDistinctDest24h()).isEqualTo(2);
        assertThat(captor.getValue().getSenderAmountSum24h()).isCloseTo(1000.0, within(0.01));
    }

    // ── 3-tier defense chain extensions ───────────────────────────────────────

    @Test
    void score_shouldPopulateTrustScoreAndAccountType_whenAvailable() {
        stubMlResponse(new BigDecimal("0.30"), "stub-v1");
        when(cbsIntegrationService.getAccountByNumber("TN59001001")).thenReturn(
                new CbsAccountData("TN59001001", "BIAT", "BIAT", "SAVINGS",
                        new BigDecimal("12345.67"), "12345678", null));

        Transaction tx = transactionWithAmount("5000.00");
        tx.getClient().setTrustScore(85);

        fraudDetectionService.score(tx);

        ArgumentCaptor<MlScoreRequest> captor = ArgumentCaptor.forClass(MlScoreRequest.class);
        verify(mlIntegrationService).score(captor.capture());

        assertThat(captor.getValue().getTrustScore()).isEqualTo(85);
        assertThat(captor.getValue().getAccountType()).isEqualTo("SAVINGS");
    }

    @Test
    void score_shouldDefaultAccountTypeToChecking_whenCbsLookupFails() {
        stubMlResponse(new BigDecimal("0.30"), "stub-v1");
        when(cbsIntegrationService.getAccountByNumber(any()))
                .thenThrow(new RuntimeException("CBS unavailable"));

        Transaction tx = transactionWithAmount("5000.00");
        tx.getClient().setTrustScore(70);

        fraudDetectionService.score(tx);

        ArgumentCaptor<MlScoreRequest> captor = ArgumentCaptor.forClass(MlScoreRequest.class);
        verify(mlIntegrationService).score(captor.capture());

        assertThat(captor.getValue().getAccountType()).isEqualTo("CHECKING");
        assertThat(captor.getValue().getTrustScore()).isEqualTo(70);
    }

    // ── v5 per-user-norm features (Phase 4.B → 4.E) ──────────────────────────

    @Test
    void score_shouldComputeAmountZScoreUser30d_givenPriorHistory() {
        stubMlResponse(new BigDecimal("0.30"), "stub-v1");

        // 10 prior tx with mean ~200, std ~50 (using values that produce
        // a clean stats spread).
        List<Transaction> history = new ArrayList<>();
        double[] amounts = {150, 175, 200, 200, 200, 200, 200, 225, 250, 200};
        for (int i = 0; i < amounts.length; i++) {
            Transaction prior = transactionWithAmount(String.valueOf(amounts[i]));
            prior.setCreatedAt(OffsetDateTime.now().minusDays(i + 1));
            history.add(prior);
        }
        when(transactionRepository.findByClientIdAndCreatedAtAfterAndStatusNotIn(
                any(), any(), any())).thenReturn(history);

        Transaction tx = transactionWithAmount("1000.00");
        fraudDetectionService.score(tx);

        ArgumentCaptor<MlScoreRequest> captor = ArgumentCaptor.forClass(MlScoreRequest.class);
        verify(mlIntegrationService).score(captor.capture());

        // z = (1000 - 200) / max(σ, 1) ≈ 800 / 30 ≈ 26 (σ ≈ 30 from those amounts)
        Double z = captor.getValue().getAmountZScoreUser30d();
        assertThat(z).isNotNull().isGreaterThan(10.0);
    }

    @Test
    void score_shouldDefaultAmountZScoreToZero_whenNoPriorHistory() {
        stubMlResponse(new BigDecimal("0.30"), "stub-v1");

        Transaction tx = transactionWithAmount("1000.00");
        fraudDetectionService.score(tx);

        ArgumentCaptor<MlScoreRequest> captor = ArgumentCaptor.forClass(MlScoreRequest.class);
        verify(mlIntegrationService).score(captor.capture());

        assertThat(captor.getValue().getAmountZScoreUser30d()).isEqualTo(0.0);
        assertThat(captor.getValue().getDaysSinceUserAccountAnomaly()).isEqualTo(999);
        assertThat(captor.getValue().getVelocityRelativeToUserNorm()).isEqualTo(1.0);
        assertThat(captor.getValue().getHourLikelihoodForUser())
                .isCloseTo(1.0 / 24.0, within(1e-6));
    }

    @Test
    void score_shouldComputeHourLikelihoodForUser_withSmoothing() {
        stubMlResponse(new BigDecimal("0.30"), "stub-v1");

        // 10 prior tx all at the same hour as 'now', so the empirical share is
        // 10/10 = 1.0. With Laplace α=5, smoothed = (10 + 5/24) / (10 + 5) ≈ 0.681.
        int currentHour = OffsetDateTime.now().getHour();
        List<Transaction> history = new ArrayList<>();
        for (int i = 0; i < 10; i++) {
            Transaction prior = transactionWithAmount("100.00");
            prior.setCreatedAt(OffsetDateTime.now()
                    .minusDays(i + 1)
                    .withHour(currentHour)
                    .withMinute(0));
            history.add(prior);
        }
        when(transactionRepository.findByClientIdAndCreatedAtAfterAndStatusNotIn(
                any(), any(), any())).thenReturn(history);

        Transaction tx = transactionWithAmount("100.00");
        fraudDetectionService.score(tx);

        ArgumentCaptor<MlScoreRequest> captor = ArgumentCaptor.forClass(MlScoreRequest.class);
        verify(mlIntegrationService).score(captor.capture());

        // Should be well above uniform prior of 1/24 ≈ 0.0417.
        Double likelihood = captor.getValue().getHourLikelihoodForUser();
        assertThat(likelihood).isNotNull().isGreaterThan(0.5);
    }

    @Test
    void score_shouldComputeVelocityRelativeToUserNorm_forCoffeeShopScenario() {
        stubMlResponse(new BigDecimal("0.30"), "stub-v1");

        // 90 prior tx spread evenly over 30 days = 3 tx/day baseline.
        // Plus 10 in the last 24h → ratio = 10 / 3 ≈ 3.3 (not 100x like a
        // naive count would suggest).
        List<Transaction> history = new ArrayList<>();
        for (int i = 0; i < 90; i++) {
            Transaction prior = transactionWithAmount("100.00");
            prior.setCreatedAt(OffsetDateTime.now().minusHours(8 * (i + 1)));
            history.add(prior);
        }
        for (int i = 0; i < 10; i++) {
            Transaction prior = transactionWithAmount("100.00");
            prior.setCreatedAt(OffsetDateTime.now().minusMinutes(60L * (i + 1)));
            history.add(prior);
        }
        when(transactionRepository.findByClientIdAndCreatedAtAfterAndStatusNotIn(
                any(), any(), any())).thenReturn(history);

        Transaction tx = transactionWithAmount("100.00");
        fraudDetectionService.score(tx);

        ArgumentCaptor<MlScoreRequest> captor = ArgumentCaptor.forClass(MlScoreRequest.class);
        verify(mlIntegrationService).score(captor.capture());

        // 24h count = 10 (the last 10 tx within 24h). 30d avg ≈ 100 / 30 = 3.33/day.
        // Ratio ≈ 10 / 3.33 ≈ 3. The marquee test: legit coffee-shop velocity
        // shows up as a moderate ratio, not the population-blowout count.
        Double ratio = captor.getValue().getVelocityRelativeToUserNorm();
        assertThat(ratio).isNotNull().isLessThan(10.0).isGreaterThan(1.0);
    }

    @Test
    void score_shouldComputeDestFamiliarityScore_fromBeneficiary() {
        stubMlResponse(new BigDecimal("0.30"), "stub-v1");

        Beneficiary ben = new Beneficiary();
        ben.setTransferCount(20);
        ben.setLastUsedAt(OffsetDateTime.now().minusDays(2));
        when(beneficiaryRepository.findByClientIdAndAccountNumber(any(), eq("TN59001002")))
                .thenReturn(Optional.of(ben));

        Transaction tx = transactionWithAmount("500.00");
        fraudDetectionService.score(tx);

        ArgumentCaptor<MlScoreRequest> captor = ArgumentCaptor.forClass(MlScoreRequest.class);
        verify(mlIntegrationService).score(captor.capture());

        // score = log(1 + 20) / max(daysSinceLast, 1) = ln(21) / 2 ≈ 1.52
        Double score = captor.getValue().getDestFamiliarityScore();
        assertThat(score).isNotNull().isCloseTo(1.52, within(0.05));
        assertThat(captor.getValue().getTransfersToDestLifetime()).isEqualTo(20);
        assertThat(captor.getValue().getIsKnownBeneficiary()).isEqualTo(1);
    }

    // ── helpers ───────────────────────────────────────────────────────────────

    private void stubMlResponse(BigDecimal score, String version) {
        MlScoreResponse response = new MlScoreResponse();
        response.setRiskScore(score);
        response.setModelVersion(version);
        when(mlIntegrationService.score(any())).thenReturn(response);
    }

    private Transaction transactionWithAmount(String amount) {
        Client client = new Client();
        client.setId(UUID.randomUUID());
        client.setCreatedAt(OffsetDateTime.now().minusDays(100));

        Transaction tx = new Transaction();
        tx.setId(UUID.randomUUID());
        tx.setClient(client);
        tx.setAmount(new BigDecimal(amount));
        tx.setSourceBalanceBefore(new BigDecimal("10000.00"));
        tx.setDestBalanceBefore(new BigDecimal("500.00"));
        tx.setSourceAccountNumber("TN59001001");
        tx.setDestinationAccountNumber("TN59001002");
        tx.setStatus(TransactionStatus.PENDING_SCORING);
        return tx;
    }
}
