"""Synthetic transaction generator (~500K rows over 12 months).

Generates a chronologically ordered, archetype-driven stream of legit
transactions. Each row mirrors the Spring Boot Transaction entity plus a few
denorms (source_account_type, sender/receiver governorate, sender_account_created_at,
dest_account_opened_at) that make downstream feature engineering vector-friendly.

Phase 4 (v5) archetype-driven realism:
    - Per-user activity ∝ archetype.monthly_tx_avg × lognormal(0, archetype.activity_sigma).
      BUSINESS_OWNER's wide σ (1.8) places the top 0.1% of business users in
      coffee-shop territory — the killer counter-example to a naive "high
      velocity = fraud" rule.
    - Per-sender hour-of-day drawn from archetype.hour_weights. NIGHT_WORKER
      peaks 22-06, RETIREE peaks 08-18, etc. So legit fraud-time-zone (3am)
      depends on WHO is sending.
    - Per-sender day-of-week drawn from archetype.dow_weights (RETIREE
      weekday-heavy, BUSINESS_OWNER less weekend-averse, etc.).
    - Per-sender amount drawn from archetype-specific lognormal(amount_logmu,
      amount_logsigma). STUDENT median ~90 TND, BUSINESS_OWNER ~1800, etc.
    - Frequent-recipients pool size from archetype.frequent_dest_count_range.
      INFREQUENT_USER may have 0 saved beneficiaries.

Fraud rows are NOT injected here — see fraud_archetypes.inject_fraud, which
reads the victim's archetype to draw out-of-character fraud for that user.
The frequent-recipients pool is exposed to fraud_archetypes via the
`build_user_frequent_recipients` helper so fraud injection can intentionally
AVOID a sender's frequent pool (impersonation hallmark).
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

import numpy as np
import pandas as pd

from data_generation.user_archetypes import (
    ARCHETYPE_NAMES,
    ARCHETYPES,
)


MOTIFS = [
    "Loyer", "Salaire", "Cadeau", "Achat", "Remboursement", "Factures",
    "Famille", "Aide", "Voyage", "Services", "Restaurant", "Pharmacie",
    None, None, None,  # ~20% null motif
]

# Probability that a legit transfer goes to someone in the sender's frequent
# pool. Higher = more "saved-beneficiary" behaviour, what real users do.
_FREQUENT_RECIPIENT_PROB = 0.70


def _sample_archetype_dates(
    n: int,
    dataset_start: datetime,
    dataset_end: datetime,
    rng: np.random.Generator,
    dow_weights: np.ndarray,
) -> pd.DatetimeIndex:
    """Sample n dates with the given day-of-week weights via rejection sampling.

    Returns the normalized date portion (time-of-day is set separately per-archetype).
    """
    span_seconds = int((dataset_end - dataset_start).total_seconds())
    start_pd = pd.Timestamp(dataset_start)
    # Acceptance prob = dow_w / max(dow_w) so the best day is always kept.
    accept_lookup = dow_weights / dow_weights.max()

    accepted = np.empty(n, dtype="datetime64[ns]")
    n_done = 0
    while n_done < n:
        need = n - n_done
        batch = min(max(need * 2, 1000), 200_000)
        secs = rng.integers(0, span_seconds, size=batch)
        cand = (start_pd + pd.to_timedelta(secs, unit="s")).tz_convert("UTC")
        keep_prob = accept_lookup[cand.dayofweek]
        keep_mask = rng.random(batch) < keep_prob
        kept = cand[keep_mask].values  # datetime64[ns]
        take = min(len(kept), need)
        accepted[n_done : n_done + take] = kept[:take]
        n_done += take

    return pd.DatetimeIndex(accepted, tz="UTC").normalize()


def build_user_frequent_recipients(
    active_users: pd.DataFrame,
    rng: np.random.Generator,
) -> dict[str, list[str]]:
    """For each active user, sample 0-40 distinct other-user CINs as their
    frequent-recipients pool, sized by archetype. Returns dict keyed by sender CIN.

    Public helper so fraud_archetypes can read the same map and INTENTIONALLY
    avoid drawing from a sender's pool when injecting impersonation-flavoured
    fraud — a fraudster doesn't know who the victim normally pays.
    """
    user_cins = active_users["cin"].to_numpy()
    n_users = len(user_cins)

    # Archetype-driven pool size — sampled per archetype in batch so an
    # INFREQUENT_USER actually gets 0-3 beneficiaries instead of the old
    # global lognormal default of ~6.
    archetypes = active_users["archetype"].to_numpy()
    sizes = np.empty(n_users, dtype=int)
    for arch_name in ARCHETYPE_NAMES:
        mask = (archetypes == arch_name)
        n_this = int(mask.sum())
        if n_this == 0:
            continue
        lo, hi = ARCHETYPES[arch_name].frequent_dest_count_range
        # rng.integers high is exclusive — add 1 so range is inclusive.
        sizes[mask] = rng.integers(lo, hi + 1, size=n_this) if hi > lo else lo

    pools: dict[str, list[str]] = {}
    for i, cin in enumerate(user_cins):
        k = int(sizes[i])
        if k == 0:
            pools[cin] = []
            continue
        # Sample k distinct OTHER user CINs. Birthday-paradox style — over
        # n_users >> k this is fast.
        candidates = rng.choice(user_cins, size=min(k * 3, n_users), replace=False)
        chosen = [c for c in candidates if c != cin][:k]
        pools[cin] = chosen
    return pools


def build_legit_transactions(
    users_df: pd.DataFrame,
    accounts_df: pd.DataFrame,
    n_transactions: int,
    dataset_start: datetime,
    dataset_end: datetime,
    rng: np.random.Generator,
    frequent_recipients: dict[str, list[str]] | None = None,
) -> pd.DataFrame:
    """Return n_transactions legit (is_fraud=0) transactions, chronologically sorted.

    Args:
        frequent_recipients: optional pre-built per-user frequent-recipients map.
            If None, generates one internally. Callers that need the same map
            for both legit generation AND fraud injection should pass the same
            instance.
    """

    # Eligible senders: ACTIVE users whose account was opened before tx time.
    active_mask = users_df["status"] == "ACTIVE"
    active_users = users_df.loc[active_mask].reset_index(drop=True)

    if frequent_recipients is None:
        frequent_recipients = build_user_frequent_recipients(active_users, rng)

    # Per-user account list keyed by CIN for fast sender-account picking.
    accounts_by_cin = {
        cin: group.reset_index(drop=True)
        for cin, group in accounts_df.groupby("client_cin", sort=False)
    }

    # ── Per-archetype sender weighting (the main v5 realism change) ──────
    # Each user's activity = archetype.monthly_tx_avg × lognormal(0, archetype.activity_sigma).
    # BUSINESS_OWNER's wide σ (1.8) gives the top 0.1% of business users a
    # coffee-shop tail (200+ tx/month) while keeping the median around 20/month.
    arch_means = np.array([
        ARCHETYPES[a].monthly_tx_avg for a in active_users["archetype"]
    ])
    arch_sigmas = np.array([
        ARCHETYPES[a].activity_sigma for a in active_users["archetype"]
    ])
    user_activity = arch_means * np.exp(rng.normal(0.0, arch_sigmas, size=len(active_users)))
    sender_weights = user_activity / user_activity.sum()
    sender_idx = rng.choice(len(active_users), size=n_transactions, p=sender_weights)

    sender_archetypes = active_users["archetype"].to_numpy()[sender_idx]
    sender_ids = active_users["id"].to_numpy()[sender_idx]
    sender_cins = active_users["cin"].to_numpy()[sender_idx]
    sender_govs = active_users["governorate"].to_numpy()[sender_idx]
    sender_created_at = active_users["created_at"].to_numpy()[sender_idx]

    # ── Per-archetype timestamps (DOW + hour weighted by sender archetype) ─
    # Pre-allocate then fill per archetype to keep numpy vectorization fast.
    timestamps_arr = np.empty(n_transactions, dtype="datetime64[ns]")
    for arch_name in ARCHETYPE_NAMES:
        mask = (sender_archetypes == arch_name)
        n_this = int(mask.sum())
        if n_this == 0:
            continue
        profile = ARCHETYPES[arch_name]

        dates = _sample_archetype_dates(
            n_this, dataset_start, dataset_end, rng, profile.dow_weights,
        )
        hours = rng.choice(24, size=n_this, p=profile.hour_weights)
        minutes = rng.integers(0, 60, size=n_this)
        secs = rng.integers(0, 60, size=n_this)
        ts_arch = (
            dates
            + pd.to_timedelta(hours, unit="h")
            + pd.to_timedelta(minutes, unit="m")
            + pd.to_timedelta(secs, unit="s")
        )
        timestamps_arr[mask] = ts_arch.values

    timestamps = pd.DatetimeIndex(timestamps_arr, tz="UTC")

    # ── Receiver selection — 70% from sender's frequent pool, 30% random ─
    cin_to_idx = {cin: i for i, cin in enumerate(active_users["cin"].to_numpy())}
    use_frequent = rng.random(n_transactions) < _FREQUENT_RECIPIENT_PROB
    receiver_cins = np.empty(n_transactions, dtype=object)
    active_cin_array = active_users["cin"].to_numpy()
    for tx_i in range(n_transactions):
        s_cin = sender_cins[tx_i]
        pool = frequent_recipients.get(s_cin) or []
        if use_frequent[tx_i] and pool:
            receiver_cins[tx_i] = pool[int(rng.integers(0, len(pool)))]
        else:
            # Random receiver, avoid self.
            tries = 0
            while True:
                r_idx = int(rng.integers(0, len(active_users)))
                r_cin = active_cin_array[r_idx]
                if r_cin != s_cin or tries > 5:
                    receiver_cins[tx_i] = r_cin
                    break
                tries += 1

    # Look up receiver indices for governorate denorm.
    receiver_idx = np.array([cin_to_idx[c] for c in receiver_cins])
    receiver_govs = active_users["governorate"].to_numpy()[receiver_idx]

    # Pick source + dest accounts: first account for each user (deterministic).
    def _first_account_for(cin: str) -> tuple[str, str, str, float, pd.Timestamp]:
        grp = accounts_by_cin.get(cin)
        if grp is None or len(grp) == 0:
            return ("UNKNOWN", "UNKNOWN", "CHECKING", 0.0, pd.Timestamp("1970-01-01", tz="UTC"))
        row = grp.iloc[0]
        opened = pd.Timestamp(row["opened_at"])
        if opened.tz is None:
            opened = opened.tz_localize("UTC")
        return (row["account_number"], row["bank_code"], row["type"],
                float(row["balance"]), opened)

    sources = [_first_account_for(c) for c in sender_cins]
    dests = [_first_account_for(c) for c in receiver_cins]
    source_accounts = [s[0] for s in sources]
    source_banks = [s[1] for s in sources]
    source_types = [s[2] for s in sources]
    initial_source_balances = np.array([s[3] for s in sources])
    dest_accounts = [d[0] for d in dests]
    dest_banks = [d[1] for d in dests]
    initial_dest_balances = np.array([d[3] for d in dests])
    dest_account_opened_at = np.array([d[4] for d in dests], dtype="datetime64[ns]")

    # ── Per-archetype amounts ────────────────────────────────────────────
    # Drawn from each sender's archetype distribution — STUDENT median ~90,
    # BUSINESS_OWNER ~1800, etc. The OLD SAVINGS-vs-CHECKING amount split
    # is gone: amount belongs to WHO sends, not WHICH account they use.
    amounts = np.empty(n_transactions, dtype=np.float64)
    for arch_name in ARCHETYPE_NAMES:
        mask = (sender_archetypes == arch_name)
        n_this = int(mask.sum())
        if n_this == 0:
            continue
        profile = ARCHETYPES[arch_name]
        amounts[mask] = rng.lognormal(
            profile.amount_logmu, profile.amount_logsigma, size=n_this,
        )
    amounts = np.maximum(amounts, 5.0).round(2)

    # Statuses for legit tx: 96% APPROVED, 2% REJECTED, 1% SUSPENDED, 1% CANCELLED.
    statuses = rng.choice(
        ["APPROVED", "REJECTED", "SUSPENDED_PENDING_ANALYST", "CANCELLED"],
        size=n_transactions, p=[0.96, 0.02, 0.01, 0.01],
    )

    motifs = rng.choice(MOTIFS, size=n_transactions)

    # Balance snapshots — use current balance jittered ± 20% to mimic running
    # account state. (A more realistic simulation would replay each tx; for ML
    # features we just need a believable balance-before.)
    balance_jitter = rng.uniform(0.6, 1.4, size=n_transactions)
    source_balance_before = np.maximum(initial_source_balances * balance_jitter, amounts + 50).round(2)
    dest_balance_before = (initial_dest_balances * rng.uniform(0.2, 1.6, size=n_transactions)).round(2)
    # Force ~3% receiver balance = 0 (matches CARD_TESTING + TAKEOVER realism).
    zero_balance_mask = rng.random(n_transactions) < 0.03
    dest_balance_before = np.where(zero_balance_mask, 0.0, dest_balance_before)

    references = [
        f"TRX-{ts.strftime('%Y%m%d')}-{uuid.uuid4().hex[:6].upper()}"
        for ts in timestamps
    ]

    df = pd.DataFrame({
        "id": [str(uuid.uuid4()) for _ in range(n_transactions)],
        "reference": references,
        "client_id": sender_ids,
        "source_account_number": source_accounts,
        "destination_account_number": dest_accounts,
        "source_bank_code": source_banks,
        "dest_bank_code": dest_banks,
        "dest_client_cin": receiver_cins,
        "amount": amounts,
        "motif": motifs,
        "status": statuses,
        "risk_score": None,
        "risk_level": None,
        "source_balance_before": source_balance_before,
        "dest_balance_before": dest_balance_before,
        "created_at": timestamps,
        "updated_at": timestamps,
        "otp_confirmed_at": timestamps,
        "executed_at": np.where(
            statuses == "APPROVED", timestamps, pd.NaT,
        ),
        "is_fraud": np.int8(0),
        "fraud_archetype": None,
        "source_account_type": source_types,
        "sender_governorate": sender_govs,
        "receiver_governorate": receiver_govs,
        "sender_account_created_at": pd.to_datetime(sender_created_at, utc=True),
        # v4 denorm — lets feature_engineering compute is_dest_new_account without
        # re-joining accounts at feature time. The default-account path matches
        # how the backend resolves dest accounts via destClientCin at inference.
        "dest_account_opened_at": pd.to_datetime(dest_account_opened_at, utc=True),
        # v5 denorm — sender's archetype, retained on the row for downstream
        # auditing (per-archetype histograms, victim-aware fraud injection).
        # Production never sees this column; the model uses per-user-norm
        # features instead.
        "sender_archetype": sender_archetypes,
    })

    # Sort chronologically — per-archetype filling left rows interleaved.
    df = df.sort_values("created_at").reset_index(drop=True)
    return df
