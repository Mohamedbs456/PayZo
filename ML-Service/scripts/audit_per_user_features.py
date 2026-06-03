"""Phase 4.B verification: per-user-norm feature audit.

Three checks:
  1. **Correlation with is_fraud** — point-biserial correlation on a held-out
     slice. The plan wants ≥ 4 of 8 features to correlate |r| > 0.3 with
     is_fraud, but note this expectation is only fully met *after* Phase 4.C
     (victim-archetype fraud). Pre-4.C, fraud is still population-shaped, so
     weaker correlations here just confirm the per-user features are ready to
     receive 4.C's stronger signal.
  2. **Cold-start defaults** — pick 50 users with their first-ever transaction
     and verify the 8 features all land on their documented defaults.
  3. **Per-archetype spread of amount_z_score_user_30d** — should be centered
     near 0 across all archetypes (most transactions are typical for the user).

Usage (from ML-Service/ root):
    python -m scripts.audit_per_user_features
"""
from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import pandas as pd

_ML_ROOT = Path(__file__).resolve().parent.parent
if str(_ML_ROOT) not in sys.path:
    sys.path.insert(0, str(_ML_ROOT))


PER_USER_FEATURES = [
    "amount_z_score_user_30d",
    "amount_pct_of_user_max_lifetime",
    "hour_likelihood_for_user",
    "dest_familiarity_score",
    "velocity_relative_to_user_norm",
    "weekday_typical_for_user",
    "account_type_typical_for_user",
    "days_since_user_account_anomaly",
]

COLD_START_DEFAULTS = {
    "amount_z_score_user_30d":          0.0,
    "amount_pct_of_user_max_lifetime":  1.0,
    "hour_likelihood_for_user":         1.0 / 24,
    "dest_familiarity_score":           0.0,
    "velocity_relative_to_user_norm":   1.0,
    "weekday_typical_for_user":         1,
    "account_type_typical_for_user":    1,
    "days_since_user_account_anomaly":  999,
}


def _load_features() -> pd.DataFrame:
    p = _ML_ROOT / "data" / "features" / "features.parquet"
    if not p.exists():
        sys.exit(f"features.parquet missing at {p} — run train.py step 3 first.")
    return pd.read_parquet(p, engine="fastparquet")


def _correlation_with_fraud(features: pd.DataFrame, sample_frac: float = 0.10) -> pd.DataFrame:
    sample = features.sample(frac=sample_frac, random_state=42)
    is_fraud = sample["is_fraud"].astype(np.float64)
    rows = []
    for col in PER_USER_FEATURES:
        x = sample[col].astype(np.float64)
        # Pearson — point-biserial for one binary side, equivalent.
        corr = x.corr(is_fraud)
        rows.append({"feature": col, "pearson_with_is_fraud": round(float(corr), 4)})
    return pd.DataFrame(rows)


def _cold_start_check(features: pd.DataFrame, n_users: int = 50) -> pd.DataFrame:
    df = features.sort_values(["client_id", "created_at"])
    first_rows = df.groupby("client_id", sort=False).head(1).head(n_users)
    rows = []
    for col, expected in COLD_START_DEFAULTS.items():
        observed = first_rows[col]
        match = (np.isclose(observed.astype(float), float(expected), rtol=1e-5)).sum()
        rows.append({
            "feature":  col,
            "default":  expected,
            "matched":  int(match),
            "checked":  len(first_rows),
            "share":    round(match / max(len(first_rows), 1), 3),
        })
    return pd.DataFrame(rows)


def _per_archetype_zscore(features: pd.DataFrame) -> pd.DataFrame:
    # Sender archetype lives on the raw tx parquet, not features — join it back.
    tx = pd.read_parquet(
        _ML_ROOT / "data" / "raw" / "transactions.parquet",
        columns=["id", "sender_archetype"],
        engine="fastparquet",
    )
    j = features.merge(tx, left_on="transaction_id", right_on="id", how="left")
    legit = j[j["is_fraud"] == 0]
    g = legit.groupby("sender_archetype")["amount_z_score_user_30d"]
    return g.agg(["count", "mean", "std", lambda s: float(s.median())]).rename(
        columns={"<lambda_0>": "median"}
    )


def main() -> None:
    features = _load_features()
    print(f"loaded features.parquet — {len(features)} rows × {len(features.columns)} cols")

    print("\n=== 1. Correlation of per-user features with is_fraud (10% sample) ===")
    corr_df = _correlation_with_fraud(features)
    print(corr_df.to_string(index=False))
    strong = (corr_df["pearson_with_is_fraud"].abs() > 0.3).sum()
    print(f"  features with |corr| > 0.3: {strong}/8 (plan target ≥ 4 — held to 4.C)")

    print("\n=== 2. Cold-start defaults (each user's first-ever tx) ===")
    cs_df = _cold_start_check(features)
    print(cs_df.to_string(index=False))
    all_good = (cs_df["share"] >= 0.95).all()
    print(f"  all defaults match in ≥95% of cold-start rows: {all_good}")

    print("\n=== 3. amount_z_score_user_30d per archetype (legit only) ===")
    arch_df = _per_archetype_zscore(features)
    print(arch_df.round(3).to_string())
    print("  expect: median ~0 across all archetypes (typical tx not anomalous)")


if __name__ == "__main__":
    main()
