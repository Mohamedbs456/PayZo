"""Phase 4.C verification: fraud rows should differ by victim archetype.

For each fraud archetype, prints amount + hour statistics grouped by the
VICTIM's archetype. If the rework worked, the same fraud archetype produces
very different rows for different victims:
    - STUDENT fraud_TAKEOVER → ~5K-15K at 02:00-05:00
    - BUSINESS_OWNER fraud_TAKEOVER → ~50K-150K at off-hours
    - NIGHT_WORKER fraud_TAKEOVER → ~8K-25K at 10:00-18:00 (inverted)

Usage (from ML-Service/ root):
    python -m scripts.audit_fraud_archetypes
"""
from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import pandas as pd

_ML_ROOT = Path(__file__).resolve().parent.parent
if str(_ML_ROOT) not in sys.path:
    sys.path.insert(0, str(_ML_ROOT))


def _per_victim_fraud_stats(fraud_archetype: str, tx: pd.DataFrame) -> pd.DataFrame:
    rows = tx[(tx["is_fraud"] == 1) & (tx["fraud_archetype"] == fraud_archetype)].copy()
    if len(rows) == 0:
        return pd.DataFrame()
    rows["hour"] = rows["created_at"].dt.hour
    g = rows.groupby("sender_archetype")
    summary = g.agg(
        n=("amount", "size"),
        amount_p50=("amount", lambda s: round(float(s.median()), 1)),
        amount_p95=("amount", lambda s: round(float(s.quantile(0.95)), 1)),
        amount_min=("amount", lambda s: round(float(s.min()), 1)),
        amount_max=("amount", lambda s: round(float(s.max()), 1)),
        peak_hour=("hour", lambda s: int(s.mode().iloc[0]) if len(s) > 0 else -1),
        night_share=("hour", lambda s: round(float(((s >= 22) | (s < 6)).mean()), 3)),
        daytime_share=("hour", lambda s: round(float(((s >= 10) & (s < 18)).mean()), 3)),
    )
    return summary


def _legit_vs_fraud_amount_compare(tx: pd.DataFrame) -> pd.DataFrame:
    """Compare per-archetype legit vs fraud amount distributions. The fraud
    amount p50 should be 5-50× the legit amount p50 for the same archetype."""
    rows = []
    for arch in tx["sender_archetype"].dropna().unique():
        sub = tx[tx["sender_archetype"] == arch]
        legit = sub[sub["is_fraud"] == 0]
        fraud = sub[sub["is_fraud"] == 1]
        if len(legit) == 0 or len(fraud) == 0:
            continue
        legit_p50 = float(legit["amount"].median())
        fraud_p50 = float(fraud["amount"].median())
        rows.append({
            "archetype":         arch,
            "n_legit":           len(legit),
            "n_fraud":           len(fraud),
            "legit_amount_p50":  round(legit_p50, 1),
            "fraud_amount_p50":  round(fraud_p50, 1),
            "fraud_x_legit":     round(fraud_p50 / max(legit_p50, 1.0), 1),
        })
    return pd.DataFrame(rows).sort_values("fraud_x_legit", ascending=False).reset_index(drop=True)


def main() -> None:
    raw_dir = _ML_ROOT / "data" / "raw"
    tx = pd.read_parquet(raw_dir / "transactions.parquet")
    print(f"loaded {len(tx)} tx ({tx['is_fraud'].sum()} fraud)")

    for fa in ["TAKEOVER", "CARD_TESTING", "LARGE_UNUSUAL", "SLOW_DRAIN",
               "SAVINGS_FRAUD", "TROJAN_TAKEOVER"]:
        print(f"\n=== Fraud archetype: {fa} (by victim) ===")
        df = _per_victim_fraud_stats(fa, tx)
        if df.empty:
            print("  (no rows — archetype not produced)")
            continue
        with pd.option_context("display.max_columns", None, "display.width", 200):
            print(df.to_string())

    print("\n=== Legit vs fraud amount comparison (per archetype) ===")
    cmp_df = _legit_vs_fraud_amount_compare(tx)
    with pd.option_context("display.max_columns", None, "display.width", 200):
        print(cmp_df.to_string(index=False))

    print("\n=== Smoking gun: same archetype LEGIT vs FRAUD amount delta ===")
    print("Each row's `fraud_x_legit` should be >>1.0 (typically 5-50×).")
    print("If all are ~1.0, the fraud rows are NOT out-of-character for victims.")

    # NIGHT_WORKER inverted-hour check
    print("\n=== NIGHT_WORKER hour inversion (legit vs fraud) ===")
    nw = tx[tx["sender_archetype"] == "NIGHT_WORKER"].copy()
    nw["hour"] = nw["created_at"].dt.hour
    legit_night = float(((nw[nw["is_fraud"] == 0]["hour"] >= 22) | (nw[nw["is_fraud"] == 0]["hour"] < 6)).mean())
    fraud_night = float(((nw[nw["is_fraud"] == 1]["hour"] >= 22) | (nw[nw["is_fraud"] == 1]["hour"] < 6)).mean())
    legit_day = float(((nw[nw["is_fraud"] == 0]["hour"] >= 10) & (nw[nw["is_fraud"] == 0]["hour"] < 18)).mean())
    fraud_day = float(((nw[nw["is_fraud"] == 1]["hour"] >= 10) & (nw[nw["is_fraud"] == 1]["hour"] < 18)).mean())
    print(f"  NIGHT_WORKER legit  → night_share={legit_night:.3f}, daytime_share={legit_day:.3f}")
    print(f"  NIGHT_WORKER fraud  → night_share={fraud_night:.3f}, daytime_share={fraud_day:.3f}")
    print("  expect: fraud daytime > legit daytime  (off-hours for night workers IS daytime)")


if __name__ == "__main__":
    main()
