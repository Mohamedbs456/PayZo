"""Point-in-time trust_score sidecar.

Emits a (client_id, t_event, trust_score) table covering:
  - initial values at each user's createdAt (source = "initial")
  - one entry per fraud_alert decision (source = "alert")

Feature engineering uses `pandas.merge_asof(direction='backward',
allow_exact_matches=False)` on this table — strict-less-than guarantees only
events EARLIER than the transaction's createdAt are visible, eliminating leakage.

See DATA_GENERATION.md §C.5 for the leakage proof.
"""
from __future__ import annotations

import numpy as np
import pandas as pd


def build_trust_history(
    users_df: pd.DataFrame,
    fraud_alerts_df: pd.DataFrame,
    transactions_df: pd.DataFrame,
) -> pd.DataFrame:
    """Build the trust-score history table.

    Algorithm:
      1. Seed the timeline with each user's initial trust_score at user.created_at.
      2. Walk fraud_alerts in chronological order. Each VALIDATED alert costs
         the receiver -15 points (clipped to [0, 100]); each REJECTED alert
         restores +3 (the alleged-fraud receiver was actually innocent).
      3. Emit a new (client_id, decidedAt, score) row for the receiver after
         each alert.
    """
    # 1. Initial entries.
    initial = pd.DataFrame({
        "client_id":   users_df["id"].to_numpy(),
        "t_event":     users_df["created_at"].to_numpy(),
        "trust_score": users_df["trust_score"].astype("int32").to_numpy(),
        "source":      "initial",
    })

    if fraud_alerts_df.empty:
        return initial.sort_values(["client_id", "t_event"]).reset_index(drop=True)

    # 2. Join alerts -> transactions to recover the receiver (dest_client_cin -> user.id).
    cin_to_id = users_df.set_index("cin")["id"]
    tx_lookup = transactions_df.set_index("id")[["dest_client_cin", "created_at"]]

    alerts = fraud_alerts_df.merge(
        tx_lookup, left_on="transaction_id", right_index=True,
        suffixes=("", "_tx"), how="inner",
    )
    alerts["receiver_id"] = alerts["dest_client_cin"].map(cin_to_id)
    alerts = alerts.dropna(subset=["receiver_id"]).sort_values("decided_at")

    # 3. Walk alerts chronologically, mutating per-user running score.
    running = dict(zip(initial["client_id"], initial["trust_score"]))
    new_events = []
    for _, alert in alerts.iterrows():
        rid = alert["receiver_id"]
        current = int(running.get(rid, 50))
        delta = -15 if alert["status"] == "VALIDATED" else 3
        updated = max(0, min(100, current + delta))
        running[rid] = updated
        new_events.append({
            "client_id":   rid,
            "t_event":     alert["decided_at"],
            "trust_score": np.int32(updated),
            "source":      "alert",
        })

    alert_events = pd.DataFrame(new_events) if new_events else pd.DataFrame(
        columns=["client_id", "t_event", "trust_score", "source"]
    )

    full = pd.concat([initial, alert_events], ignore_index=True)
    full = full.sort_values(["client_id", "t_event"]).reset_index(drop=True)
    return full


def as_of_trust_score(
    transactions_df: pd.DataFrame,
    trust_history_df: pd.DataFrame,
) -> pd.Series:
    """Look up the most-recent-but-strictly-earlier trust_score for each tx.

    Uses `merge_asof(direction='backward', allow_exact_matches=False)` which is
    the canonical leakage-proof temporal join in pandas.
    """
    left = transactions_df[["id", "client_id", "created_at"]].sort_values("created_at").copy()
    right = trust_history_df.sort_values("t_event")[["client_id", "t_event", "trust_score"]]

    # Both keyed dataframes must have a sorted left-key (created_at / t_event)
    # and an equality match on client_id.
    merged = pd.merge_asof(
        left,
        right,
        left_on="created_at",
        right_on="t_event",
        by="client_id",
        direction="backward",
        allow_exact_matches=False,
    )
    # Realign to the original tx order.
    merged = merged.set_index("id")["trust_score"].astype("Int32")
    merged = merged.reindex(transactions_df["id"])
    # Fallback: any tx without a prior trust event (shouldn't happen if users
    # were initialized before their tx) gets the neutral 50.
    return merged.fillna(50).astype("int32").reset_index(drop=True)
