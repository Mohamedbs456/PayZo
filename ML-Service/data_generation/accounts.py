"""Synthetic CBS account generator (~12K rows, 1.2× user count).

Every user gets at least one account; ~20% have a second. 70/30 CHECKING/SAVINGS
split across the population (not per-user). Balance distributions differ by type:
CHECKING follows LogNormal(7.5, 1.2) — median ≈ 1 800 TND; SAVINGS follows
LogNormal(9.0, 1.0) — median ≈ 8 100 TND. `openedAt` is uniform within
[2018-01-01, dataset_start].
"""
from __future__ import annotations

from datetime import datetime, date

import numpy as np
import pandas as pd

from data_generation.banks import BANK_CODE_WEIGHTS

CHECKING_SHARE_DEFAULT = 0.70


def _sample_unique_ints(rng: np.random.Generator, low: int, high: int, n: int) -> np.ndarray:
    """Sample n unique ints uniformly from [low, high) without materializing the
    whole pool. Birthday-paradox collisions are astronomically rare when
    (high - low) >> n^2, so the rejection loop terminates after one or two
    batches in practice.
    """
    pool_size = high - low
    if n > pool_size:
        raise ValueError(f"Cannot sample {n} unique ints from a pool of {pool_size}")
    out: set[int] = set()
    while len(out) < n:
        need = n - len(out)
        batch = rng.integers(low, high, size=max(need * 2, 128))
        out.update(int(x) for x in batch)
    return np.fromiter(out, dtype=np.int64, count=n)


def build_accounts_dataframe(
    users_df: pd.DataFrame,
    n_accounts: int,
    dataset_start: datetime,
    rng: np.random.Generator,
    checking_share: float = CHECKING_SHARE_DEFAULT,
) -> pd.DataFrame:
    """Return accounts.parquet rows.

    Strategy: assign one account per user first (10K), then attach extra accounts
    to a random ~20% subset of users to reach `n_accounts` total. Account numbers
    are guaranteed 12-digit unique strings.
    """
    if n_accounts < len(users_df):
        raise ValueError("n_accounts must be >= number of users (one account per user minimum)")

    user_cins = users_df["cin"].to_numpy()
    base_assignments = user_cins.copy()

    extra_needed = n_accounts - len(users_df)
    if extra_needed > 0:
        # Pick users to receive a second account.
        extras = rng.choice(user_cins, size=extra_needed, replace=True)
        cin_per_account = np.concatenate([base_assignments, extras])
    else:
        cin_per_account = base_assignments

    n = len(cin_per_account)

    # Account numbers: 12 digits, unique. We avoid np.arange over the full
    # 12-digit space (would need ~6.5 TiB) by sampling random ints + dedup.
    account_numbers = _sample_unique_ints(rng, 100_000_000_000, 1_000_000_000_000, n)
    account_numbers_str = [f"{int(a):012d}" for a in account_numbers]

    # Bank-code distribution (weighted).
    bank_codes_list = list(BANK_CODE_WEIGHTS.keys())
    bank_weights = np.array([BANK_CODE_WEIGHTS[c] for c in bank_codes_list])
    bank_weights = bank_weights / bank_weights.sum()
    bank_codes = rng.choice(bank_codes_list, size=n, p=bank_weights)

    # Account type: 70% CHECKING / 30% SAVINGS across all accounts.
    types = rng.choice(
        ["CHECKING", "SAVINGS"], size=n, p=[checking_share, 1 - checking_share]
    )

    # Balance — different distribution per type.
    is_checking = types == "CHECKING"
    balances = np.where(
        is_checking,
        rng.lognormal(mean=7.5, sigma=1.2, size=n),
        rng.lognormal(mean=9.0, sigma=1.0, size=n),
    )
    # Floor at 50 TND so no accounts start with ~0 balance.
    balances = np.maximum(balances, 50.0).round(2)

    # openedAt: uniform within [2018-01-01, dataset_start). Stored as
    # datetime64[ns] (fastparquet doesn't infer plain Python date objects).
    opened_lower = pd.Timestamp(date(2018, 1, 1))
    opened_upper = pd.Timestamp(dataset_start).tz_convert(None) if pd.Timestamp(dataset_start).tz is not None else pd.Timestamp(dataset_start)
    span_days = (opened_upper - opened_lower).days
    offset_days = rng.integers(0, span_days, size=n)
    opened_at = opened_lower + pd.to_timedelta(offset_days, unit="D")

    df = pd.DataFrame({
        "account_number": account_numbers_str,
        "client_cin": cin_per_account,
        "bank_code": bank_codes,
        "type": types,
        "balance": balances,
        "opened_at": opened_at,
    })
    return df


def attach_default_accounts(users_df: pd.DataFrame, accounts_df: pd.DataFrame) -> pd.DataFrame:
    """Fill `users_df.default_account_id` with each user's first account number."""
    first_accounts = (
        accounts_df.sort_values(["client_cin", "opened_at"])
        .groupby("client_cin")["account_number"]
        .first()
    )
    users_df = users_df.copy()
    users_df["default_account_id"] = users_df["cin"].map(first_accounts)
    return users_df
