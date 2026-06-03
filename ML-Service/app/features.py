"""Inference-time feature vector packing — v5 (Phase 4).

Loads the fitted sklearn Pipeline from artifacts/feature_pipeline.pkl (written
by train.py via promote_top_two at training time) and uses it to transform an
incoming ScoreRequest into the 24-column matrix that the Tier 1 / Tier 2
models expect.

If the pipeline artifact is missing (cold start with no train run yet), the
fallback path builds a vector by direct field access — same column ordering
as `feature_engineering.OUTPUT_FEATURE_NAMES` — so the service still answers
requests via Tier 3 / Stub paths.
"""
from __future__ import annotations

from pathlib import Path

import joblib
import numpy as np
import pandas as pd

from app.schemas import ScoreRequest
from feature_engineering import OUTPUT_FEATURE_NAMES

FEATURE_NAMES = list(OUTPUT_FEATURE_NAMES)

ARTIFACTS_DIR = Path("artifacts")
_PIPELINE_PATH = ARTIFACTS_DIR / "feature_pipeline.pkl"
_pipeline = None


def _load_pipeline():
    global _pipeline
    if _pipeline is None and _PIPELINE_PATH.exists():
        _pipeline = joblib.load(_PIPELINE_PATH)
    return _pipeline


def _request_to_row(req: ScoreRequest) -> pd.DataFrame:
    return pd.DataFrame([{
        # Population-relative (15)
        "log_amount":                     req.logAmount,
        "amount_to_balance_ratio":        req.amountToBalanceRatio,
        "is_balance_zero_receiver":       req.isBalanceZeroReceiver,
        "distance_km":                    req.distanceKm,
        "hour_of_day":                    int(req.hourOfDay),
        "sender_tx_count_24h":            req.senderTxCount24h,
        "sender_amount_sum_24h":          req.senderAmountSum24h,
        "sender_distinct_dest_24h":       req.senderDistinctDest24h,
        "sender_account_age_days":        req.senderAccountAgeDays,
        "is_sender_new_account":          req.isSenderNewAccount,
        "trust_score":                    req.trustScore,
        "is_known_beneficiary":           req.isKnownBeneficiary,
        "transfers_to_dest_lifetime":     req.transfersToDestLifetime,
        "is_dest_new_account":            req.isDestNewAccount,
        "days_since_last_transaction":    req.daysSinceLastTransaction,
        # Per-user-norm (8)
        "amount_z_score_user_30d":          req.amountZScoreUser30d,
        "amount_pct_of_user_max_lifetime":  req.amountPctOfUserMaxLifetime,
        "hour_likelihood_for_user":         req.hourLikelihoodForUser,
        "dest_familiarity_score":           req.destFamiliarityScore,
        "velocity_relative_to_user_norm":   req.velocityRelativeToUserNorm,
        "weekday_typical_for_user":         req.weekdayTypicalForUser,
        "account_type_typical_for_user":    req.accountTypeTypicalForUser,
        "days_since_user_account_anomaly":  req.daysSinceUserAccountAnomaly,
        # Categorical
        "account_type":                   req.accountType,
    }])


def build_feature_vector(req: ScoreRequest) -> np.ndarray:
    """Return a (1, 24) ndarray of features in OUTPUT_FEATURE_NAMES order
    (23 numeric + 1 one-hot account_type_savings)."""
    pipeline = _load_pipeline()
    row = _request_to_row(req)
    if pipeline is not None:
        return pipeline.transform(row)

    # Fallback ordering for cold-start (no pipeline yet). Keep in lock-step
    # with feature_engineering.NUMERIC_COLS + the one-hot bit.
    is_savings = 1 if req.accountType == "SAVINGS" else 0
    return np.array([[
        req.logAmount,
        req.amountToBalanceRatio,
        req.isBalanceZeroReceiver,
        req.distanceKm,
        int(req.hourOfDay),
        req.senderTxCount24h,
        req.senderAmountSum24h,
        req.senderDistinctDest24h,
        req.senderAccountAgeDays,
        req.isSenderNewAccount,
        req.trustScore,
        req.isKnownBeneficiary,
        req.transfersToDestLifetime,
        req.isDestNewAccount,
        req.daysSinceLastTransaction,
        req.amountZScoreUser30d,
        req.amountPctOfUserMaxLifetime,
        req.hourLikelihoodForUser,
        req.destFamiliarityScore,
        req.velocityRelativeToUserNorm,
        req.weekdayTypicalForUser,
        req.accountTypeTypicalForUser,
        req.daysSinceUserAccountAnomaly,
        is_savings,
    ]], dtype=np.float64)
