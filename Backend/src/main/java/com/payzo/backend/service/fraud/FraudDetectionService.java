package com.payzo.backend.service.fraud;

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
import com.payzo.backend.service.integration.CbsIntegrationService;
import com.payzo.backend.service.integration.MlIntegrationService;
import com.payzo.backend.service.integration.MlIntegrationService.MlScoreRequest;
import com.payzo.backend.service.integration.MlIntegrationService.MlScoreResponse;
import com.payzo.backend.util.GovernorateLookup;
import com.payzo.backend.util.PerUserStats;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

/**
 * Glue between the transfer pipeline and the ML scorer. v5 contract: builds
 * the 24-feature request (15 population + 8 per-user-norm + 1 categorical) and
 * dispatches to MlIntegrationService.score. RiskLevel is derived from the
 * thresholds in MlModelConfig (default 0.30 / 0.70).
 *
 * <p>v5 changes:
 * <ul>
 *   <li>One 30-day window query feeds 6 features (24h velocity stats are
 *       derived from the same in-memory list).</li>
 *   <li>One lifetime-max query for amount_pct_of_user_max_lifetime.</li>
 *   <li>Per-user-norm features computed by {@link PerUserStats}.</li>
 *   <li>Dropped wire fields: isNight, destIsFavorite, amountZScoreVsUserMedian,
 *       amountVsDestMaxPrior.</li>
 * </ul>
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class FraudDetectionService {

    private final MlIntegrationService mlIntegrationService;
    private final MlModelConfigRepository mlModelConfigRepository;
    private final TransactionRepository transactionRepository;
    private final ClientRepository clientRepository;
    private final CbsIntegrationService cbsIntegrationService;
    private final BeneficiaryRepository beneficiaryRepository;

    public ScoringResult score(Transaction transaction) {
        MlScoreRequest request = buildScoreRequest(transaction);
        MlScoreResponse response = mlIntegrationService.score(request);

        RiskLevel riskLevel = determineRiskLevel(response.getRiskScore());

        log.info("Scored transaction {}: riskScore={}, riskLevel={}, model={}",
                transaction.getId(), response.getRiskScore(), riskLevel, response.getModelVersion());

        List<String> reasons = response.getReasons() != null
                ? response.getReasons() : List.of();
        return new ScoringResult(
                response.getRiskScore(), riskLevel, response.getModelVersion(), reasons);
    }

    private MlScoreRequest buildScoreRequest(Transaction transaction) {
        BigDecimal amount = transaction.getAmount();
        BigDecimal senderBalance = transaction.getSourceBalanceBefore();
        BigDecimal receiverBalance = transaction.getDestBalanceBefore();
        Client sender = transaction.getClient();

        double logAmount = Math.log1p(amount.doubleValue());
        double amountToBalanceRatio = amount.doubleValue() / (senderBalance.doubleValue() + 1.0);
        int isBalanceZeroReceiver = receiverBalance.compareTo(BigDecimal.ZERO) == 0 ? 1 : 0;

        // Distance: sender governorate → receiver governorate
        String senderGov = sender.getGovernorate();
        String receiverGov = null;
        if (transaction.getDestClientCin() != null) {
            receiverGov = clientRepository.findByCin(transaction.getDestClientCin())
                    .map(Client::getGovernorate)
                    .orElse(null);
        }
        double distanceKm = GovernorateLookup.haversineKm(senderGov, receiverGov);

        OffsetDateTime now = OffsetDateTime.now();
        int hourOfDay = now.getHour();
        int dayOfWeek = now.getDayOfWeek().getValue() - 1;  // Monday=0..Sunday=6

        // ── Single 30-day window load. 24h velocity stats are derived from
        //    the same list so we don't hit the DB twice for overlapping data.
        OffsetDateTime thirtyDaysAgo = now.minusDays(30);
        List<Transaction> window30d = transactionRepository
                .findByClientIdAndCreatedAtAfterAndStatusNotIn(
                        sender.getId(),
                        thirtyDaysAgo,
                        List.of(TransactionStatus.REJECTED, TransactionStatus.CANCELLED));

        OffsetDateTime twentyFourHoursAgo = now.minusHours(24);
        List<Transaction> recent24h = new ArrayList<>();
        for (Transaction t : window30d) {
            if (!t.getCreatedAt().isBefore(twentyFourHoursAgo)) {
                recent24h.add(t);
            }
        }

        int senderTxCount24h = recent24h.size();
        double senderAmountSum24h = recent24h.stream()
                .map(Transaction::getAmount)
                .mapToDouble(BigDecimal::doubleValue)
                .sum();
        int senderDistinctDest24h = (int) recent24h.stream()
                .map(Transaction::getDestinationAccountNumber)
                .distinct()
                .count();

        // Account age
        long senderAccountAgeDays = ChronoUnit.DAYS.between(
                sender.getCreatedAt().toLocalDate(),
                now.toLocalDate());
        int isSenderNewAccount = senderAccountAgeDays <= 30 ? 1 : 0;

        // Trust + account-type. CBS lookup is opportunistic — any failure
        // falls back to CHECKING so scoring never blocks on it.
        int trustScore = sender.getTrustScore();
        String accountType = "CHECKING";
        try {
            CbsIntegrationService.CbsAccountData sourceAccount = cbsIntegrationService
                    .getAccountByNumber(transaction.getSourceAccountNumber());
            if (sourceAccount != null && sourceAccount.type() != null) {
                accountType = sourceAccount.type();
            }
        } catch (Exception ex) {
            log.debug("CBS account lookup failed for {} during scoring — using default accountType",
                    transaction.getSourceAccountNumber(), ex);
        }

        // ── Saved-beneficiary depth + dest familiarity score.
        int isKnownBeneficiary = 0;
        int transfersToDestLifetime = 0;
        double destFamiliarityScore = 0.0;
        try {
            Optional<Beneficiary> savedBen = beneficiaryRepository
                    .findByClientIdAndAccountNumber(sender.getId(),
                            transaction.getDestinationAccountNumber());
            if (savedBen.isPresent()) {
                Beneficiary b = savedBen.get();
                isKnownBeneficiary = 1;
                transfersToDestLifetime = Math.max(b.getTransferCount(), 0);
                if (transfersToDestLifetime > 0 && b.getLastUsedAt() != null) {
                    long daysSinceLast = Math.max(
                            ChronoUnit.DAYS.between(b.getLastUsedAt(), now), 1L);
                    destFamiliarityScore = Math.log1p(transfersToDestLifetime) / daysSinceLast;
                }
            }
        } catch (Exception ex) {
            log.debug("Beneficiary lookup failed for client {} dest {} — defaulting",
                    sender.getId(), transaction.getDestinationAccountNumber(), ex);
        }

        // ── Destination account freshness from CBS.
        int isDestNewAccount = 0;
        try {
            CbsIntegrationService.CbsAccountData destAccount = cbsIntegrationService
                    .getAccountByNumber(transaction.getDestinationAccountNumber());
            if (destAccount != null && destAccount.openedAt() != null) {
                long destAgeDays = ChronoUnit.DAYS.between(
                        destAccount.openedAt(), LocalDate.now());
                isDestNewAccount = destAgeDays <= 30 ? 1 : 0;
            }
        } catch (Exception ex) {
            log.debug("CBS dest-account lookup failed for {} — defaulting isDestNewAccount=0",
                    transaction.getDestinationAccountNumber(), ex);
        }

        // ── Dormancy: days since sender's most-recent prior transfer.
        //    Pulled from the 30-day window — accurate up to 30 days, beyond
        //    which we report 999 (matches Python's default for first-ever).
        int daysSinceLastTransaction = 999;
        OffsetDateTime mostRecentPriorAt = null;
        for (Transaction t : window30d) {
            OffsetDateTime ts = t.getCreatedAt();
            if (mostRecentPriorAt == null || ts.isAfter(mostRecentPriorAt)) {
                mostRecentPriorAt = ts;
            }
        }
        if (mostRecentPriorAt != null) {
            long days = ChronoUnit.DAYS.between(mostRecentPriorAt, now);
            daysSinceLastTransaction = (int) Math.max(0, Math.min(days, 999));
        }

        // ── Per-user-norm features (7 of 8; destFamiliarityScore handled above).
        PerUserStats.Features perUser = PerUserStats.compute(
                window30d,
                amount,
                hourOfDay,
                dayOfWeek,
                accountType,
                senderTxCount24h,
                now);

        // ── amount_pct_of_user_max_lifetime — one cheap MAX query.
        double amountPctOfUserMaxLifetime = 1.0;
        try {
            BigDecimal lifetimeMax = transactionRepository.findMaxAmountByClientId(sender.getId());
            if (lifetimeMax != null && lifetimeMax.compareTo(BigDecimal.ONE) > 0) {
                amountPctOfUserMaxLifetime = amount.doubleValue() / lifetimeMax.doubleValue();
            }
        } catch (Exception ex) {
            log.debug("Lifetime max lookup failed for client {} — defaulting ratio to 1.0",
                    sender.getId(), ex);
        }

        return MlScoreRequest.builder()
                .transactionId(transaction.getId())
                // Population-relative (15)
                .logAmount(logAmount)
                .amountToBalanceRatio(amountToBalanceRatio)
                .isBalanceZeroReceiver(isBalanceZeroReceiver)
                .distanceKm(distanceKm)
                .hourOfDay(hourOfDay)
                .senderTxCount24h(senderTxCount24h)
                .senderAmountSum24h(senderAmountSum24h)
                .senderDistinctDest24h(senderDistinctDest24h)
                .senderAccountAgeDays((int) senderAccountAgeDays)
                .isSenderNewAccount(isSenderNewAccount)
                .trustScore(trustScore)
                .isKnownBeneficiary(isKnownBeneficiary)
                .transfersToDestLifetime(transfersToDestLifetime)
                .isDestNewAccount(isDestNewAccount)
                .daysSinceLastTransaction(daysSinceLastTransaction)
                // Per-user-norm (8)
                .amountZScoreUser30d(perUser.amountZScoreUser30d())
                .amountPctOfUserMaxLifetime(amountPctOfUserMaxLifetime)
                .hourLikelihoodForUser(perUser.hourLikelihoodForUser())
                .destFamiliarityScore(destFamiliarityScore)
                .velocityRelativeToUserNorm(perUser.velocityRelativeToUserNorm())
                .weekdayTypicalForUser(perUser.weekdayTypicalForUser())
                .accountTypeTypicalForUser(perUser.accountTypeTypicalForUser())
                .daysSinceUserAccountAnomaly(perUser.daysSinceUserAccountAnomaly())
                // Categorical
                .accountType(accountType)
                .build();
    }

    private RiskLevel determineRiskLevel(BigDecimal riskScore) {
        MlModelConfig config = mlModelConfigRepository.findFirstBy()
                .orElseThrow(() -> new IllegalStateException("ML config not seeded"));

        if (riskScore.compareTo(config.getThresholdLowMedium()) < 0) {
            return RiskLevel.LOW;
        }
        if (riskScore.compareTo(config.getThresholdMediumHigh()) < 0) {
            return RiskLevel.MEDIUM;
        }
        return RiskLevel.HIGH;
    }

    /**
     * Outcome of a scoring call.
     *
     * @param reasons human-readable explanations from the scorer; may be empty but
     *                never null (caller normalises a null payload to {@code List.of()})
     */
    public record ScoringResult(BigDecimal riskScore,
                                RiskLevel riskLevel,
                                String modelVersion,
                                List<String> reasons) {}
}
