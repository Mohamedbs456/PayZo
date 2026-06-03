package com.payzo.backend.util;

import com.payzo.backend.domain.entity.Transaction;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.time.temporal.ChronoUnit;
import java.util.List;

/**
 * Per-user-norm feature computation (v5, Phase 4.B). Mirrors
 * ML-Service/data_generation/per_user_features.py — produces 7 of the 8
 * per-user features from a sender's 30-day transaction window. (The 8th,
 * {@link Features#destFamiliarityScore destFamiliarityScore}, comes from the
 * Beneficiary entity and is computed inline by FraudDetectionService.)
 *
 * <p>All values are STRICTLY backward-looking: the caller is responsible for
 * passing a window that does NOT include the current transaction being scored.
 *
 * <p>Cold-start defaults (when the window is empty or smaller than
 * {@link #MIN_PRIORS_FOR_ZSCORE}) match the Python contract:
 * <ul>
 *   <li>amountZScoreUser30d &rarr; 0.0
 *   <li>amountPctOfUserMaxLifetime &rarr; 1.0 (passed in, defaulted by caller)
 *   <li>hourLikelihoodForUser &rarr; 1/24 ≈ 0.0417
 *   <li>velocityRelativeToUserNorm &rarr; 1.0
 *   <li>weekdayTypicalForUser &rarr; 1
 *   <li>accountTypeTypicalForUser &rarr; 1
 *   <li>daysSinceUserAccountAnomaly &rarr; 999
 * </ul>
 */
public final class PerUserStats {

    /** Laplace smoothing α for hour-likelihood — α=5 matches the Python contract. */
    public static final double LAPLACE_ALPHA = 5.0;

    /** Minimum priors before z-score / anomaly detection trusts itself. */
    public static final int MIN_PRIORS_FOR_ZSCORE = 5;

    private PerUserStats() {}

    /**
     * 7 of the 8 per-user-norm features. destFamiliarityScore is derived from
     * the Beneficiary entity (transferCount, lastUsedAt) by the caller.
     */
    public record Features(
            double amountZScoreUser30d,
            double hourLikelihoodForUser,
            double velocityRelativeToUserNorm,
            int weekdayTypicalForUser,
            int accountTypeTypicalForUser,
            int daysSinceUserAccountAnomaly
    ) {}

    /**
     * Compute the per-user features.
     *
     * @param window30d         sender's transactions in the 30-day window before {@code now},
     *                          excluding the current transaction (strictly prior).
     * @param currentAmount     amount of the transaction being scored (TND).
     * @param currentHourOfDay  hour of the current tx (0-23).
     * @param currentDayOfWeek  day-of-week of the current tx (Monday=0..Sunday=6).
     * @param currentAccountType  "CHECKING" or "SAVINGS".
     * @param senderTxCount24h  number of sender's prior tx in the last 24h
     *                          (already computed by FraudDetectionService).
     * @param now               the scoring moment.
     */
    public static Features compute(
            List<Transaction> window30d,
            BigDecimal currentAmount,
            int currentHourOfDay,
            int currentDayOfWeek,
            String currentAccountType,
            int senderTxCount24h,
            OffsetDateTime now
    ) {
        if (window30d == null || window30d.isEmpty()) {
            // Pure cold start — emit documented defaults.
            return new Features(0.0, 1.0 / 24.0, 1.0, 1, 1, 999);
        }

        int n = window30d.size();
        double[] amounts = new double[n];
        int[] hourBuckets = new int[24];
        int[] dowBuckets = new int[7];
        OffsetDateTime firstTxAt = null;

        for (int i = 0; i < n; i++) {
            Transaction tx = window30d.get(i);
            amounts[i] = tx.getAmount().doubleValue();
            OffsetDateTime ts = tx.getCreatedAt();
            int h = ts.getHour();
            int dow = ts.getDayOfWeek().getValue() - 1;  // Monday=0..Sunday=6
            hourBuckets[h]++;
            dowBuckets[dow]++;
            if (firstTxAt == null || ts.isBefore(firstTxAt)) firstTxAt = ts;
        }

        // ── amount z-score: requires ≥5 priors so a one-sample std-clamped-to-1
        //    doesn't fabricate huge z-scores.
        double zScore = 0.0;
        double mean = 0.0;
        double std = 1.0;
        if (n >= MIN_PRIORS_FOR_ZSCORE) {
            double sum = 0.0;
            for (double a : amounts) sum += a;
            mean = sum / n;
            double sumSq = 0.0;
            for (double a : amounts) sumSq += (a - mean) * (a - mean);
            std = Math.max(Math.sqrt(sumSq / n), 1.0);
            zScore = (currentAmount.doubleValue() - mean) / std;
        }

        // ── hour likelihood with Laplace smoothing.
        double hourLikelihood = (hourBuckets[currentHourOfDay] + LAPLACE_ALPHA / 24.0)
                / (n + LAPLACE_ALPHA);

        // ── weekday typical: DOW share in window ≥ 1/14 (= half the uniform DOW prior).
        double dowShare = dowBuckets[currentDayOfWeek] / (double) n;
        int weekdayTypical = (dowShare >= (1.0 / 14.0)) ? 1 : 0;

        // ── account-type typical: Transaction does not denormalise source
        //    account type today, so we'd need a CBS round-trip per prior tx
        //    to compute the true mode. Defaulted to 1 (typical) for now —
        //    the v5 trained model gives this feature near-zero importance
        //    (NaN correlation in the 4.B audit). If signal emerges in v6
        //    we'll add a `source_account_type` column to the Transaction
        //    entity and populate it at TransferService.create time.
        int accountTypeTypical = 1;

        // ── velocity relative to user's 30d avg tx/day.
        double spanDays;
        if (firstTxAt != null) {
            long secs = ChronoUnit.SECONDS.between(firstTxAt, now);
            spanDays = Math.max(secs / 86_400.0, 1.0);
        } else {
            spanDays = 1.0;
        }
        spanDays = Math.min(spanDays, 30.0);
        double avgPerDay = n / spanDays;
        double velocityRatio = (avgPerDay > 0.0) ? senderTxCount24h / Math.max(avgPerDay, 0.1) : 1.0;

        // ── days since the most recent prior anomaly (|z| > 2 against the
        //    window stats). We use the window-wide mean/std as a proxy for
        //    the per-row running stats Python computes — slightly less precise
        //    but cheap and faithful enough for inference. Defaults to 999.
        int daysSinceAnomaly = 999;
        if (n >= MIN_PRIORS_FOR_ZSCORE) {
            OffsetDateTime latestAnomalyAt = null;
            for (Transaction tx : window30d) {
                double txZ = Math.abs((tx.getAmount().doubleValue() - mean) / std);
                if (txZ > 2.0) {
                    if (latestAnomalyAt == null || tx.getCreatedAt().isAfter(latestAnomalyAt)) {
                        latestAnomalyAt = tx.getCreatedAt();
                    }
                }
            }
            if (latestAnomalyAt != null) {
                long d = ChronoUnit.DAYS.between(latestAnomalyAt, now);
                daysSinceAnomaly = (int) Math.max(0, Math.min(d, 999));
            }
        }

        return new Features(
                zScore,
                hourLikelihood,
                velocityRatio,
                weekdayTypical,
                accountTypeTypical,
                daysSinceAnomaly
        );
    }
}
