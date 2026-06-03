"""Per-user-norm features — Phase 4.B.

Eight features that compare each transaction against the SENDER's own history
rather than against population statistics. The model uses these to learn each
user's personal baseline at inference time:

    1. amount_z_score_user_30d         z-score vs sender's 30d mean/stddev
    2. amount_pct_of_user_max_lifetime amount / sender's max prior amount
    3. hour_likelihood_for_user        P(hour | user 30d histogram), Laplace smoothed
    4. dest_familiarity_score          log(1+prior_to_dest) / max(days_since_last,1)
    5. velocity_relative_to_user_norm  24h count / 30d avg tx/day
    6. weekday_typical_for_user        1 if DOW share in 30d ≥ 1/14, else 0
    7. account_type_typical_for_user   1 if current account_type matches 30d mode
    8. days_since_user_account_anomaly days since sender's last |z|>2 tx (999 if none)

All computations are STRICTLY backward-looking: each row depends only on prior
transactions for the same user. Cold-start (no prior history) gets documented
defaults documented per-feature below.

The model never sees the user's archetype label — these 8 features encode the
archetype implicitly via the user's transaction shape.
"""
from __future__ import annotations

from collections import deque

import numpy as np
import pandas as pd

# Laplace smoothing α for hour_likelihood — α=5 means a brand-new tx hour
# starts at roughly the uniform 1/24 prior and converges to the empirical
# share after ~5 prior tx at that hour.
LAPLACE_ALPHA: float = 5.0

# Minimum priors before we trust z-score / anomaly detection. Below this we
# return defaults (0.0 z-score, no anomaly flag) — single-prior z-scores
# with std clamped to 1 explode and create false anomalies.
_MIN_PRIORS_FOR_ZSCORE = 5

_WINDOW_NS = np.timedelta64(30, "D")
_WIN24_NS = np.timedelta64(24, "h")


def compute_per_user_features(tx_df: pd.DataFrame) -> pd.DataFrame:
    """Compute the 8 per-user-norm features for a transactions DataFrame.

    Args:
        tx_df: must contain `id` (UUID str), `client_id`, `created_at`,
               `amount`, `source_account_type`, `destination_account_number`.

    Returns:
        DataFrame keyed by transaction id with 8 feature columns. Index is the
        transaction id; ready to join onto features by `transaction_id`.
    """
    if len(tx_df) == 0:
        return _empty_output()

    dest_familiarity = _compute_dest_familiarity(tx_df)
    user_features = _compute_user_window_features(tx_df)
    out = user_features.join(dest_familiarity, how="left")
    out["dest_familiarity_score"] = out["dest_familiarity_score"].fillna(0.0)
    return out


def _empty_output() -> pd.DataFrame:
    cols = [
        "amount_z_score_user_30d",
        "amount_pct_of_user_max_lifetime",
        "hour_likelihood_for_user",
        "dest_familiarity_score",
        "velocity_relative_to_user_norm",
        "weekday_typical_for_user",
        "account_type_typical_for_user",
        "days_since_user_account_anomaly",
    ]
    return pd.DataFrame(columns=cols, dtype=float).rename_axis("tx_id")


def _compute_dest_familiarity(tx_df: pd.DataFrame) -> pd.Series:
    """log(1 + prior_transfers_to_dest) / max(days_since_last_to_dest, 1).

    Vectorized via groupby on (client_id, destination_account_number) +
    cumcount + shift. First-ever transfer to a destination → 0.0 (zero
    familiarity, not even one prior).
    """
    df = tx_df[["id", "client_id", "destination_account_number", "created_at"]].copy()
    df = df.sort_values(
        ["client_id", "destination_account_number", "created_at"]
    ).reset_index(drop=True)

    grp = df.groupby(["client_id", "destination_account_number"], sort=False)
    prior_count = grp.cumcount()                              # 0 for first row of pair
    prior_ts = grp["created_at"].shift(1)                     # NaT for first row of pair
    days_since = (df["created_at"] - prior_ts).dt.total_seconds() / 86400.0
    days_since = days_since.clip(lower=1.0)                   # 1.0 floor (intra-day)

    score = np.log1p(prior_count) / days_since.fillna(1.0)
    # First-ever transfer to this dest → no familiarity. Mask via prior_count==0.
    score = score.where(prior_count > 0, 0.0).astype("float64")

    return pd.Series(score.to_numpy(), index=df["id"], name="dest_familiarity_score")


def _compute_user_window_features(tx_df: pd.DataFrame) -> pd.DataFrame:
    """One pass per user — incremental 30d and 24h windows.

    Maintains O(1)-amortized state (deques + running sums + 24-bucket hour
    histogram + 7-bucket DOW histogram + 2-bucket account-type histogram)
    so total work is O(n_tx) regardless of user activity profile.
    """
    df = tx_df.sort_values(["client_id", "created_at"]).reset_index(drop=True)
    n = len(df)

    ids = df["id"].to_numpy()
    cids = df["client_id"].to_numpy()
    timestamps = df["created_at"].to_numpy()
    amounts = df["amount"].astype(np.float64).to_numpy()
    hours = pd.to_datetime(timestamps).hour.to_numpy()
    dows = pd.to_datetime(timestamps).dayofweek.to_numpy()
    actypes = df["source_account_type"].to_numpy()

    # Outputs with documented cold-start defaults.
    z30 = np.zeros(n, dtype=np.float64)
    pct_max = np.ones(n, dtype=np.float64)
    hour_lik = np.full(n, 1.0 / 24, dtype=np.float64)
    velocity_ratio = np.ones(n, dtype=np.float64)
    weekday_typ = np.ones(n, dtype=np.int8)
    actype_typ = np.ones(n, dtype=np.int8)
    days_anom = np.full(n, 999, dtype=np.int32)

    # Per-user state (reset at each new user)
    win_buf: deque = deque()             # (ts, amount, hour, dow, actype) inside 30d
    win24_buf: deque = deque()           # ts inside 24h
    win_sum = 0.0
    win_sum_sq = 0.0
    win_count = 0
    hour_bucket = np.zeros(24, dtype=np.int32)
    dow_bucket = np.zeros(7, dtype=np.int32)
    actype_bucket: dict[str, int] = {}
    lifetime_max = 0.0
    last_anomaly_ts: np.datetime64 | None = None
    first_ts: np.datetime64 | None = None
    prev_cid = None

    for i in range(n):
        cid = cids[i]
        if cid != prev_cid:
            # New user — wipe all state
            win_buf.clear()
            win24_buf.clear()
            win_sum = 0.0
            win_sum_sq = 0.0
            win_count = 0
            hour_bucket.fill(0)
            dow_bucket.fill(0)
            actype_bucket.clear()
            lifetime_max = 0.0
            last_anomaly_ts = None
            first_ts = None
            prev_cid = cid

        ts_i = timestamps[i]
        amt_i = amounts[i]
        hr_i = int(hours[i])
        dow_i = int(dows[i])
        at_i = actypes[i]

        # ── Expire stale rows from the 30d window ──────────────────────
        cutoff_30d = ts_i - _WINDOW_NS
        while win_buf and win_buf[0][0] < cutoff_30d:
            _, amt_old, hr_old, dow_old, at_old = win_buf.popleft()
            win_sum -= amt_old
            win_sum_sq -= amt_old * amt_old
            win_count -= 1
            hour_bucket[hr_old] -= 1
            dow_bucket[dow_old] -= 1
            actype_bucket[at_old] -= 1

        # ── Expire stale rows from the 24h window ──────────────────────
        cutoff_24h = ts_i - _WIN24_NS
        while win24_buf and win24_buf[0] < cutoff_24h:
            win24_buf.popleft()

        # ── Compute features from current window state ─────────────────
        if win_count > 0:
            # Z-score and anomaly detection only meaningful after enough priors.
            if win_count >= _MIN_PRIORS_FOR_ZSCORE:
                mean = win_sum / win_count
                var = max(win_sum_sq / win_count - mean * mean, 0.0)
                std = max(np.sqrt(var), 1.0)
                z30[i] = (amt_i - mean) / std

            # Hour likelihood with Laplace smoothing — always safe to compute.
            hour_lik[i] = (
                hour_bucket[hr_i] + LAPLACE_ALPHA / 24.0
            ) / (win_count + LAPLACE_ALPHA)

            # Weekday typical: DOW share in window ≥ 1/14 of total. Threshold
            # 1/14 = half the uniform DOW prior of 1/7, so we accept days the
            # user touches at least half as often as the average day.
            dow_share = dow_bucket[dow_i] / win_count
            weekday_typ[i] = 1 if dow_share >= (1.0 / 14.0) else 0

            # Account type typical: current type matches user's window mode.
            if actype_bucket:
                most_used = max(actype_bucket, key=actype_bucket.get)
                actype_typ[i] = 1 if at_i == most_used else 0

            # Velocity relative to user's 30d avg tx/day. Use min(span, 30) so
            # brand-new users aren't unfairly normalized against an empty 30d
            # window — we use whatever span their history actually covers.
            if first_ts is not None:
                span_days_total = max(
                    (ts_i - first_ts) / np.timedelta64(1, "D"), 1.0
                )
            else:
                span_days_total = 1.0
            span_days = min(span_days_total, 30.0)
            avg_per_day = win_count / max(span_days, 1.0)
            velocity_ratio[i] = (
                len(win24_buf) / max(avg_per_day, 0.1) if avg_per_day > 0 else 1.0
            )

        # Lifetime max (strictly prior — we update lifetime_max AFTER this).
        if lifetime_max > 0:
            pct_max[i] = amt_i / lifetime_max

        # Anomaly recency (strictly prior — last_anomaly_ts records earlier rows only).
        if last_anomaly_ts is not None:
            days_anom[i] = int(
                (ts_i - last_anomaly_ts) / np.timedelta64(1, "D")
            )

        # ── Update state with current tx (post-feature-computation) ────
        win_buf.append((ts_i, amt_i, hr_i, dow_i, at_i))
        win_sum += amt_i
        win_sum_sq += amt_i * amt_i
        win_count += 1
        hour_bucket[hr_i] += 1
        dow_bucket[dow_i] += 1
        actype_bucket[at_i] = actype_bucket.get(at_i, 0) + 1
        win24_buf.append(ts_i)

        if amt_i > lifetime_max:
            lifetime_max = amt_i

        if first_ts is None:
            first_ts = ts_i

        # Set anomaly flag AFTER feature computation, so NEXT row sees it.
        # Use the just-computed z30 (which is 0 if win_count < _MIN_PRIORS_FOR_ZSCORE,
        # so no false anomalies from cold-start volatility).
        if abs(z30[i]) > 2.0:
            last_anomaly_ts = ts_i

    return pd.DataFrame(
        {
            "amount_z_score_user_30d": z30,
            "amount_pct_of_user_max_lifetime": pct_max,
            "hour_likelihood_for_user": hour_lik,
            "velocity_relative_to_user_norm": velocity_ratio,
            "weekday_typical_for_user": weekday_typ,
            "account_type_typical_for_user": actype_typ,
            "days_since_user_account_anomaly": days_anom,
        },
        index=pd.Index(ids, name="tx_id"),
    )
