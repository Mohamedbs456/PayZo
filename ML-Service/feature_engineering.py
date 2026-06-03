"""Reusable feature pipeline — single source of truth.

Used at TRAIN time by `train.py` and at INFERENCE time by `app/features.py`
(loaded via joblib from `artifacts/feature_pipeline.pkl`).

The 24-feature vector (v5 — per-user-norm rework):

  Population-relative (15):
    log_amount                  log1p(amount)
    amount_to_balance_ratio     amount / (sender_balance + 1)
    is_balance_zero_receiver    receiver_balance == 0 ?
    distance_km                 haversine(sender_gov, receiver_gov)
    hour_of_day                 int 0..23
    sender_tx_count_24h         count of sender's non-rejected tx in prior 24h
    sender_amount_sum_24h       sum thereof
    sender_distinct_dest_24h    distinct destinations thereof
    sender_account_age_days     days since sender's createdAt
    is_sender_new_account       account_age <= 30 ?
    trust_score                 sender Client.trustScore at time T (point-in-time)
    is_known_beneficiary        sender has saved + used this destination before
    transfers_to_dest_lifetime  Beneficiary.transferCount (0 if unknown)
    is_dest_new_account         dest CBS account opened < 30 days ago
    days_since_last_transaction gap to sender's prior tx (999 if first-ever)

  Per-user-norm (8) — encode each row against the SENDER's own history:
    amount_z_score_user_30d         (amount - μ30) / max(σ30, 1)
    amount_pct_of_user_max_lifetime amount / max(prior lifetime amount, 1)
    hour_likelihood_for_user        P(hour | user's 30d histogram), α=5 Laplace smoothed
    dest_familiarity_score          log(1+prior_to_dest) / max(days_since_last,1)
    velocity_relative_to_user_norm  sender_tx_count_24h / max(30d avg tx/day, 0.1)
    weekday_typical_for_user        1 if DOW share in 30d ≥ 1/14, else 0
    account_type_typical_for_user   1 if current account_type matches user's 30d mode
    days_since_user_account_anomaly days since user's last |z|>2 tx (999 if none)

  Categorical (1):
    account_type                    CHECKING | SAVINGS (one-hot as account_type_savings)

Why v5 (the v4.2 → v5 motivation):
    v4.2 PR-AUC topped out at 0.672 because the synthetic data had no per-user
    behavioural identity — two users with the same activity rate looked the
    same. The model learned population-wide signals (velocity, is_known_beneficiary,
    amount tier) but couldn't flag "out of character for this user," which is
    exactly the thing ML should beat rules at.

    Phase 4 fixes this by (a) giving each synthetic user a persistent archetype
    (STUDENT, BUSINESS_OWNER, RETIREE, NIGHT_WORKER, etc.), (b) injecting fraud
    that's anomalous for the VICTIM's archetype not the population, and (c)
    adding the 8 per-user-norm features above so the model can learn the
    user's baseline at inference time. The model never sees the archetype
    label — production users don't have one — but the features encode it.

    The two v4.2 features we dropped:
      - amount_z_score_vs_user_median (24-month median) is subsumed by the
        more responsive amount_z_score_user_30d (30-day mean).
      - amount_vs_dest_max_prior was a one-shot escalation signal that the
        v5 dest_familiarity_score covers more flexibly.

Tier 1 (best GBM) and Tier 2 (best bagging model) both use `scale_numeric=False`
since trees are scale-invariant. The pipeline still exposes the option for any
future linear-model variant.
"""
from __future__ import annotations

from sklearn.compose import ColumnTransformer
from sklearn.impute import SimpleImputer
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler

NUMERIC_COLS: list[str] = [
    # Population-relative features (15) — same shape as v4.2 minus the two
    # dropped 24-month / escalation columns that v5 replaces with per-user-norm.
    "log_amount",
    "amount_to_balance_ratio",
    "is_balance_zero_receiver",
    "distance_km",
    "hour_of_day",
    "sender_tx_count_24h",
    "sender_amount_sum_24h",
    "sender_distinct_dest_24h",
    "sender_account_age_days",
    "is_sender_new_account",
    "trust_score",
    "is_known_beneficiary",
    "transfers_to_dest_lifetime",
    "is_dest_new_account",
    "days_since_last_transaction",
    # v5 per-user-norm features (8) — see data_generation/per_user_features.py
    # for the exact computation. All strictly backward-looking; cold-start
    # defaults are documented at the source.
    "amount_z_score_user_30d",
    "amount_pct_of_user_max_lifetime",
    "hour_likelihood_for_user",
    "dest_familiarity_score",
    "velocity_relative_to_user_norm",
    "weekday_typical_for_user",
    "account_type_typical_for_user",
    "days_since_user_account_anomaly",
]

CATEGORICAL_COLS: list[str] = ["account_type"]

# Final output column ordering. Anything reading the pipeline output should
# use this list — never assume positional indexing without it.
OUTPUT_FEATURE_NAMES: list[str] = NUMERIC_COLS + ["account_type_savings"]


def build_pipeline(scale_numeric: bool = False) -> Pipeline:
    """Build a fresh feature pipeline.

    Args:
        scale_numeric: if True, append a StandardScaler to the numeric branch.
            Tier 2 (logistic regression) needs scaled inputs; Tier 1 (XGBoost)
            does not.

    Returns:
        An unfitted sklearn Pipeline whose `transform` returns an ndarray with
        columns ordered per `OUTPUT_FEATURE_NAMES`.
    """
    numeric_steps: list = [("impute", SimpleImputer(strategy="median"))]
    if scale_numeric:
        numeric_steps.append(("scale", StandardScaler()))

    pre = ColumnTransformer(
        transformers=[
            ("num", Pipeline(numeric_steps), NUMERIC_COLS),
            (
                "cat",
                OneHotEncoder(
                    categories=[["CHECKING", "SAVINGS"]],
                    drop="first",            # only emit account_type_savings (= 1 if SAVINGS)
                    handle_unknown="ignore",
                    sparse_output=False,
                ),
                CATEGORICAL_COLS,
            ),
        ],
        remainder="drop",
    )
    return Pipeline([("pre", pre)])


def get_output_feature_names() -> list[str]:
    """Return the ordered list of column names produced by the pipeline."""
    return list(OUTPUT_FEATURE_NAMES)
