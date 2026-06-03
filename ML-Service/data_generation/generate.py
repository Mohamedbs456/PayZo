"""End-to-end synthetic data generator entrypoint.

Reads `config/training.yaml` and writes:
  data/raw/banks.parquet
  data/raw/users.parquet
  data/raw/accounts.parquet
  data/raw/transactions.parquet
  data/raw/fraud_alerts.parquet
  data/raw/trust_score_history.parquet

Usage: import data_generation.generate and call main(config_path).
train.py invokes this in step 2 if the parquet outputs are missing or stale.
"""
from __future__ import annotations

import time
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd
import yaml

from data_generation.accounts import attach_default_accounts, build_accounts_dataframe
from data_generation.banks import build_banks_dataframe
from data_generation.beneficiaries import build_beneficiaries_dataframe
from data_generation.fraud_archetypes import inject_fraud
from data_generation.transactions import (
    build_legit_transactions,
    build_user_frequent_recipients,
)
from data_generation.trust_score_evolution import build_trust_history
from data_generation.users import build_users_dataframe


def _ensure_dir(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)


def _save_parquet(df: pd.DataFrame, path: Path) -> None:
    # Engine is auto-detected by pandas based on what's installed (fastparquet
    # by default for PayZo — pyarrow is no longer a hard dep). Compression
    # falls back to snappy on either engine.
    df.to_parquet(path, index=False, compression="snappy", engine="fastparquet")


def main(config_path: str | Path = "config/training.yaml") -> dict:
    """Generate all raw parquets. Returns a dict of row counts per output."""
    start = time.monotonic()
    config = yaml.safe_load(Path(config_path).read_text())
    data_cfg = config["data"]
    rng = np.random.default_rng(data_cfg["random_seed"])

    n_users = data_cfg["users"]["count"]
    n_accounts = data_cfg["accounts"]["count"]
    checking_share = data_cfg["accounts"]["checking_share"]
    n_transactions = data_cfg["transactions"]["count"]
    fraud_rate = data_cfg["transactions"]["fraud_rate"]
    epoch_offset_months = data_cfg["transactions"]["epoch_offset_months"]
    fraud_mix = data_cfg["fraud_mix"]

    now = datetime.now(timezone.utc).replace(microsecond=0)
    dataset_start = now - pd.DateOffset(months=epoch_offset_months)
    dataset_end = now

    raw_dir = Path(config["paths"]["raw_dir"])
    _ensure_dir(raw_dir)

    print(f"[gen] Dataset window: {dataset_start.isoformat()} → {dataset_end.isoformat()}")

    # -------- 1. Banks -----------------------------------------------------
    print("[gen] Building banks…")
    banks_df = build_banks_dataframe(now=now)
    _save_parquet(banks_df, raw_dir / "banks.parquet")

    # -------- 2. Users -----------------------------------------------------
    print(f"[gen] Building {n_users} users…")
    users_df = build_users_dataframe(n_users, dataset_start, rng)

    # -------- 3. Accounts --------------------------------------------------
    print(f"[gen] Building {n_accounts} accounts…")
    accounts_df = build_accounts_dataframe(
        users_df, n_accounts, dataset_start, rng, checking_share=checking_share
    )
    users_df = attach_default_accounts(users_df, accounts_df)
    _save_parquet(users_df, raw_dir / "users.parquet")
    _save_parquet(accounts_df, raw_dir / "accounts.parquet")

    # -------- 4a. Per-user frequent-recipients pool (v4) -----------------
    # Built ONCE here and shared with both legit-transaction generation (so
    # 70% of legit transfers route through the pool) and beneficiary
    # synthesis (so saved-beneficiary rows match the same destinations).
    print("[gen] Building per-user frequent-recipients pool…")
    active_users = users_df[users_df["status"] == "ACTIVE"].reset_index(drop=True)
    frequent_recipients = build_user_frequent_recipients(active_users, rng)

    # -------- 4b. Legit transactions --------------------------------------
    n_legit = n_transactions - int(round(n_transactions * fraud_rate))
    print(f"[gen] Building {n_legit} legit transactions…")
    legit_df = build_legit_transactions(
        users_df, accounts_df, n_legit, dataset_start, dataset_end, rng,
        frequent_recipients=frequent_recipients,
    )

    # -------- 5. Inject fraud ---------------------------------------------
    n_fraud_target = n_transactions - n_legit
    print(f"[gen] Injecting ~{n_fraud_target} fraud rows across 5 archetypes…")
    combined_df, fraud_alerts_df = inject_fraud(
        legit_df, users_df, accounts_df,
        n_fraud_target=n_fraud_target,
        archetype_mix=fraud_mix,
        dataset_start=dataset_start, dataset_end=dataset_end,
        rng=rng,
    )

    _save_parquet(combined_df, raw_dir / "transactions.parquet")
    _save_parquet(fraud_alerts_df, raw_dir / "fraud_alerts.parquet")

    # -------- 6. Trust-score history --------------------------------------
    print("[gen] Building trust_score_history (point-in-time)…")
    trust_df = build_trust_history(users_df, fraud_alerts_df, combined_df)
    _save_parquet(trust_df, raw_dir / "trust_score_history.parquet")

    # -------- 7. Beneficiaries (v4) ---------------------------------------
    print("[gen] Building beneficiaries from frequent-recipients pool…")
    beneficiaries_df = build_beneficiaries_dataframe(
        combined_df, users_df, frequent_recipients, rng
    )
    _save_parquet(beneficiaries_df, raw_dir / "beneficiaries.parquet")

    elapsed = time.monotonic() - start
    counts = {
        "banks":               len(banks_df),
        "users":               len(users_df),
        "accounts":            len(accounts_df),
        "transactions":        len(combined_df),
        "transactions_fraud":  int(combined_df["is_fraud"].sum()),
        "fraud_alerts":        len(fraud_alerts_df),
        "trust_score_history": len(trust_df),
        "beneficiaries":       len(beneficiaries_df),
    }
    print(f"[gen] Done in {elapsed:.1f}s. Counts: {counts}")
    return counts


if __name__ == "__main__":
    main()
