"""Phase 4.A verification: dump per-archetype transaction statistics.

Confirms that archetype-driven generation produces distinct behavioural
signatures (amount distribution, hour-of-day pattern, velocity envelope, etc.).
The output is what we cite when telling the jury "the data has per-user
behavioral identity" — a flat or matching table per archetype would mean the
rework didn't work.

Usage (from ML-Service/ root):
    python -m scripts.audit_archetypes
"""
from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import pandas as pd

# Make this script runnable from the ML-Service/ root directory.
_ML_ROOT = Path(__file__).resolve().parent.parent
if str(_ML_ROOT) not in sys.path:
    sys.path.insert(0, str(_ML_ROOT))

from data_generation.user_archetypes import ARCHETYPE_NAMES, ARCHETYPES  # noqa: E402


def _load_parquets(raw_dir: Path) -> tuple[pd.DataFrame, pd.DataFrame]:
    users = pd.read_parquet(raw_dir / "users.parquet")
    tx = pd.read_parquet(raw_dir / "transactions.parquet")
    return users, tx


def _per_archetype_summary(users: pd.DataFrame, tx: pd.DataFrame) -> pd.DataFrame:
    # Only legit rows for the baseline summary — fraud is the out-of-character
    # signal we WANT to flag downstream, not what we're measuring here.
    legit = tx[tx["is_fraud"] == 0].copy()

    # Span in months (for tx/user/month average).
    span_days = (legit["created_at"].max() - legit["created_at"].min()).days
    span_months = max(span_days / 30.0, 1.0)

    legit["hour"] = legit["created_at"].dt.hour
    legit["dow"] = legit["created_at"].dt.dayofweek

    rows = []
    for arch in ARCHETYPE_NAMES:
        n_users = int((users["archetype"] == arch).sum())
        arch_tx = legit[legit["sender_archetype"] == arch]
        n_tx = len(arch_tx)

        if n_tx == 0 or n_users == 0:
            rows.append({"archetype": arch, "n_users": n_users, "n_tx": 0})
            continue

        # Velocity: per-sender tx count over the span, then describe the distribution.
        per_sender_tx = arch_tx.groupby("client_id").size()
        per_sender_monthly = per_sender_tx / span_months

        # Distinct destinations per sender
        per_sender_dest = arch_tx.groupby("client_id")["destination_account_number"].nunique()

        rows.append({
            "archetype":          arch,
            "n_users":            n_users,
            "n_tx":               n_tx,
            "amount_p50":         round(float(arch_tx["amount"].median()), 1),
            "amount_p95":         round(float(arch_tx["amount"].quantile(0.95)), 1),
            "amount_p99":         round(float(arch_tx["amount"].quantile(0.99)), 1),
            "tx_per_user_p50":    round(float(per_sender_monthly.median()), 2),
            "tx_per_user_p95":    round(float(per_sender_monthly.quantile(0.95)), 2),
            "tx_per_user_max":    round(float(per_sender_monthly.max()), 2),
            # Night share = 22:00-05:59 (matches the fraud-time-zone framing).
            "night_share":        round(float(((arch_tx["hour"] >= 22) | (arch_tx["hour"] < 6)).mean()), 3),
            "weekend_share":      round(float((arch_tx["dow"] >= 5).mean()), 3),
            "distinct_dest_p50":  round(float(per_sender_dest.median()), 1),
            "distinct_dest_p95":  round(float(per_sender_dest.quantile(0.95)), 1),
        })

    return pd.DataFrame(rows)


def _coffee_shop_tail(users: pd.DataFrame, tx: pd.DataFrame, top_n: int = 5) -> pd.DataFrame:
    """Print the most active BUSINESS_OWNER users — should hit 100+ tx/month."""
    biz_users = users[users["archetype"] == "BUSINESS_OWNER"]["id"].to_numpy()
    legit = tx[(tx["is_fraud"] == 0) & (tx["client_id"].isin(biz_users))]
    span_days = (legit["created_at"].max() - legit["created_at"].min()).days
    span_months = max(span_days / 30.0, 1.0)

    per_sender = legit.groupby("client_id").size().sort_values(ascending=False).head(top_n)
    coffee_df = pd.DataFrame({
        "client_id":     per_sender.index,
        "total_tx":      per_sender.values,
        "tx_per_month":  (per_sender.values / span_months).round(1),
        "tx_per_day":    (per_sender.values / span_days).round(2),
    })
    return coffee_df


def main() -> None:
    raw_dir = _ML_ROOT / "data" / "raw"
    if not raw_dir.exists():
        sys.exit(f"data dir not found: {raw_dir}. Run `python -m data_generation.generate` first.")

    users, tx = _load_parquets(raw_dir)

    print("\n=== Per-archetype transaction statistics ===")
    summary = _per_archetype_summary(users, tx)
    with pd.option_context("display.max_columns", None, "display.width", 200):
        print(summary.to_string(index=False))

    print("\n=== BUSINESS_OWNER velocity tail (coffee-shop scenario) ===")
    coffee = _coffee_shop_tail(users, tx, top_n=10)
    with pd.option_context("display.max_columns", None, "display.width", 200):
        print(coffee.to_string(index=False))

    # Sanity expectations (printed, not enforced — let the human eye check):
    print("\n=== Sanity checks ===")
    p50 = dict(zip(summary["archetype"], summary["amount_p50"]))
    print(f"  STUDENT amount_p50:        {p50.get('STUDENT', 'n/a')}     (expect ~80-100)")
    print(f"  BUSINESS_OWNER p50:        {p50.get('BUSINESS_OWNER', 'n/a')}    (expect ~1500-2200)")
    print(f"  HIGH_NET_WORTH p50:        {p50.get('HIGH_NET_WORTH', 'n/a')}    (expect ~6500-10000)")

    night = dict(zip(summary["archetype"], summary["night_share"]))
    print(f"  NIGHT_WORKER night share:  {night.get('NIGHT_WORKER', 'n/a')}    (expect > 0.50)")
    print(f"  RETIREE night share:       {night.get('RETIREE', 'n/a')}    (expect < 0.05)")

    max_tx = dict(zip(summary["archetype"], summary["tx_per_user_max"]))
    print(f"  BUSINESS_OWNER tx/user max: {max_tx.get('BUSINESS_OWNER', 'n/a')}  (expect > 100 — coffee-shop tail)")


if __name__ == "__main__":
    main()
