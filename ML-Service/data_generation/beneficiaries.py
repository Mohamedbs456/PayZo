"""Synthetic beneficiaries generator — derives saved recipients from the
frequent-recipients pool used during legit-transaction generation.

A `Beneficiary` row in payzo-backend models a sender's saved recipient. Not
every repeat recipient is "saved" — for synthetic data we use the per-user
frequent pool (see `transactions.build_user_frequent_recipients`) as the
ground truth: senders who routed transfers through their frequent pool are
treated as having saved those destinations.

The resulting parquet has one row per (client_id, destination_account_number)
pair that the sender used during the dataset window. Aggregate stats
(transfer_count, first_used_at, last_used_at) come from the combined
transactions parquet. Cached first/last names come from the users parquet.

Feature usage (Phase 2 v4):
    - `is_known_beneficiary`        join on (client_id, dest_account)
    - `transfers_to_dest_lifetime`  the transfer_count column
Both are computed point-in-time at feature-engineering time (see
`train.build_features`), so the value at row T is the number of transfers BEFORE
T — not the final lifetime total in this parquet.
"""
from __future__ import annotations

import uuid

import numpy as np
import pandas as pd


def build_beneficiaries_dataframe(
    combined_df: pd.DataFrame,
    users_df: pd.DataFrame,
    frequent_recipients: dict[str, list[str]],
    rng: np.random.Generator,
) -> pd.DataFrame:
    """Return one Beneficiary row per (client_id, destination_account_number)
    that originated from the sender's frequent-recipients pool.

    Args:
        combined_df: transactions parquet (legit + fraud merged, post-injection)
        users_df: users parquet (for sender/receiver name lookup)
        frequent_recipients: per-sender CIN → list of dest CINs map. Generated
            via `transactions.build_user_frequent_recipients` and reused here.
        rng: numpy Generator for nicknames / favorite flags.
    """
    # Only legit transactions count as "saved beneficiary usage" — fraud rows
    # represent attacks, not user-curated saves.
    legit = combined_df[combined_df["is_fraud"] == 0]

    # Pre-build the sender CIN → set of frequent dest CINs map for fast lookup.
    frequent_set: dict[str, set[str]] = {
        cin: set(pool) for cin, pool in frequent_recipients.items()
    }

    # Build sender_id → sender_cin map so we can check the frequent pool.
    id_to_cin = users_df.set_index("id")["cin"].to_dict()

    # Mark each legit tx with whether sender→receiver was in the frequent pool.
    sender_cins = legit["client_id"].map(id_to_cin)
    receiver_cins = legit["dest_client_cin"]
    keep_mask = [
        (s in frequent_set and r in frequent_set[s])
        for s, r in zip(sender_cins, receiver_cins)
    ]
    saved = legit.loc[keep_mask].copy()

    if len(saved) == 0:
        # Empty parquet with the right columns — keeps downstream loaders happy.
        return _empty_beneficiaries_frame()

    # Aggregate per (client_id, destination_account_number).
    agg = (
        saved.groupby(["client_id", "destination_account_number"])
             .agg(
                 first_used_at=("created_at", "min"),
                 last_used_at=("created_at", "max"),
                 transfer_count=("id", "count"),
                 receiver_cin=("dest_client_cin", "first"),
                 bank_code=("dest_bank_code", "first"),
             )
             .reset_index()
    )

    # Cached first/last name from users_df keyed by receiver_cin.
    cin_to_name = users_df.set_index("cin")[["first_name", "last_name"]]
    name_lookup = cin_to_name.reindex(agg["receiver_cin"].to_numpy())
    agg["cached_first_name"] = name_lookup["first_name"].to_numpy()
    agg["cached_last_name"] = name_lookup["last_name"].to_numpy()

    # ~30% of saved beneficiaries get a nickname.
    nickname_pool = ["Mom", "Dad", "Boss", "Plumber", "Landlord", "Brother",
                     "Sister", "Friend", "Cousin", "Work"]
    has_nickname = rng.random(len(agg)) < 0.30
    agg["nickname"] = np.where(
        has_nickname,
        rng.choice(nickname_pool, size=len(agg)),
        None,
    )

    # ~35% favorite-pinned — v4.2 bumped from 20% so the model has enough
    # positive examples of `dest_is_favorite=1` to learn it as a trust signal
    # without it being too rare to influence decision surfaces.
    agg["is_favorite"] = rng.random(len(agg)) < 0.35

    # confirmedAt = first_used_at (mirrors backend: set on first successful debit).
    agg["confirmed_at"] = agg["first_used_at"]
    agg["created_at"] = agg["first_used_at"]
    agg["updated_at"] = agg["last_used_at"]

    agg["id"] = [str(uuid.uuid4()) for _ in range(len(agg))]
    agg = agg.rename(columns={"destination_account_number": "account_number"})

    # Final column order matches the Beneficiary entity (drop receiver_cin — it
    # was only needed for name lookup, not stored on the entity).
    return agg[[
        "id", "client_id", "account_number",
        "cached_first_name", "cached_last_name", "nickname",
        "bank_code", "is_favorite",
        "confirmed_at", "first_used_at", "last_used_at", "transfer_count",
        "created_at", "updated_at",
    ]]


def _empty_beneficiaries_frame() -> pd.DataFrame:
    return pd.DataFrame(columns=[
        "id", "client_id", "account_number",
        "cached_first_name", "cached_last_name", "nickname",
        "bank_code", "is_favorite",
        "confirmed_at", "first_used_at", "last_used_at", "transfer_count",
        "created_at", "updated_at",
    ])
