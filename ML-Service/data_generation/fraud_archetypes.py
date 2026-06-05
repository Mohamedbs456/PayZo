"""Out-of-character fraud injection — Phase 4.C (victim-archetype aware).

Inserts ~1.5% fraud rows into an existing legit transactions DataFrame and
returns the merged dataset plus a parallel `fraud_alerts` DataFrame.

The v5 change vs v4: each fraud archetype reads the victim's USER archetype
(STUDENT, BUSINESS_OWNER, NIGHT_WORKER, …) and parameterizes amounts, hours,
and destination preferences from `FRAUD_OVERRIDES[fraud_archetype][victim_archetype]`.

The same fraud archetype produces different rows for different victims:
  - TAKEOVER on STUDENT       → 5K–15K TND at 02:00–05:00 (huge for them)
  - TAKEOVER on BUSINESS_OWNER → 50K–150K TND (5K would be a normal day)
  - TAKEOVER on NIGHT_WORKER  → 8K–25K TND at 10:00–18:00 (daytime is OFF)
  - CARD_TESTING on BUSINESS  → 50–200 tx burst (must exceed coffee-shop velocity)
  - SAVINGS_FRAUD             → skipped unless victim has a SAVINGS account

The jury smoking gun lives in this table: the same parameters mean different
things for different users, so a rule engine can't generalize the way ML can.

Fraud archetypes still injected:
  - TAKEOVER          long-distance, large amount, off-hours
  - CARD_TESTING      burst of small transfers to fresh dests
  - LARGE_UNUSUAL     single very-large amount to a new beneficiary
  - SLOW_DRAIN        4..8 medium transfers across 3..7 days
  - SAVINGS_FRAUD     SAVINGS source, off-hours, large (skipped if no SAVINGS account)
  - TROJAN_TAKEOVER   5–15 small setup transfers then 1–3 drain transfers
"""
from __future__ import annotations

import uuid
from datetime import timedelta

import numpy as np
import pandas as pd

from data_generation.governorates import LONG_DISTANCE_PAIRS

ARCHETYPES = [
    "TAKEOVER", "CARD_TESTING", "LARGE_UNUSUAL", "SLOW_DRAIN", "SAVINGS_FRAUD",
    "TROJAN_TAKEOVER", "SUSTAINED_ESCALATION",
]

# Victim archetypes that have any SAVINGS account assigned at generation time.
# SAVINGS_FRAUD only fires on these — for others we skip and re-roll the
# archetype in the inject_fraud loop.
_SAVINGS_OK_ARCHETYPES = {"BUSINESS_OWNER", "HIGH_NET_WORTH"}

# Fallback victim archetype used if a row arrives without an `archetype` field
# (shouldn't happen post-Phase-4.A, but defensive).
_DEFAULT_VICTIM = "YOUNG_PROFESSIONAL"


# ────────────────────────────────────────────────────────────────────────────
# FRAUD_OVERRIDES — the victim-archetype dispatch table.
#
# For each (fraud_archetype, victim_archetype), defines the fraud parameters
# that are anomalous *for that specific victim*. Same fraud archetype, different
# victim → different draw distributions.
#
# Fields per fraud archetype:
#   TAKEOVER, SAVINGS_FRAUD, LARGE_UNUSUAL: amount_range, anomalous_hours
#   CARD_TESTING:                           amount_range, n_range, burst_window_min
#   SLOW_DRAIN:                             amount_range
#   TROJAN_TAKEOVER:                        setup_amount_range, drain_amount_range,
#                                           drain_anomalous_hours
# ────────────────────────────────────────────────────────────────────────────

# Anomalous hour sets per victim archetype — the hours where THIS user almost
# never transacts legitimately. Pulled from their hour_weights in user_archetypes.py.
_OFF_HOURS = {
    "STUDENT":            [2, 3, 4, 5],                 # they sleep
    "YOUNG_PROFESSIONAL": [2, 3, 4, 5],
    "RETIREE":            [22, 23, 0, 1, 2, 3, 4, 5],   # never transacts after 19h
    "BUSINESS_OWNER":     [0, 1, 2, 3, 4, 5],
    "HIGH_NET_WORTH":     [2, 3, 4, 5],
    "INFREQUENT_USER":    [2, 3, 4, 5],
    # NIGHT_WORKER's "off hours" are DAYTIME — inverted from everyone else.
    "NIGHT_WORKER":       [10, 11, 12, 13, 14, 15, 16, 17],
}


def _off_hours(archetype: str) -> list[int]:
    return _OFF_HOURS.get(archetype, _OFF_HOURS[_DEFAULT_VICTIM])


FRAUD_OVERRIDES: dict[str, dict[str, dict]] = {
    # Each amount_range = (min, max) TND, sized as 50-100× the archetype's
    # legit median for the small-amount archetypes, 5-30× for big-spenders.
    "TAKEOVER": {
        "STUDENT":            {"amount_range": (5_000,   15_000),  "n_range": (1, 3)},
        "YOUNG_PROFESSIONAL": {"amount_range": (15_000,  40_000),  "n_range": (1, 3)},
        "RETIREE":            {"amount_range": (1_500,   5_000),   "n_range": (1, 2)},
        "BUSINESS_OWNER":     {"amount_range": (50_000,  150_000), "n_range": (1, 3)},
        "HIGH_NET_WORTH":     {"amount_range": (80_000,  300_000), "n_range": (1, 3)},
        "INFREQUENT_USER":    {"amount_range": (2_000,   8_000),   "n_range": (1, 3)},
        "NIGHT_WORKER":       {"amount_range": (8_000,   25_000),  "n_range": (1, 3)},
    },
    "CARD_TESTING": {
        # n_range capped: a small burst is already a clear per-user velocity anomaly, and big bursts swamped the fraud row budget.
        "STUDENT":            {"amount_range": (5,   30),  "n_range": (8, 16)},
        "YOUNG_PROFESSIONAL": {"amount_range": (50,  300), "n_range": (8, 16)},
        "RETIREE":            {"amount_range": (20,  100), "n_range": (6, 12)},
        "BUSINESS_OWNER":     {"amount_range": (100, 500), "n_range": (15, 35)},
        "HIGH_NET_WORTH":     {"amount_range": (100, 800), "n_range": (10, 20)},
        "INFREQUENT_USER":    {"amount_range": (5,   50),  "n_range": (5, 12)},
        "NIGHT_WORKER":       {"amount_range": (30,  200), "n_range": (8, 16)},
    },
    "LARGE_UNUSUAL": {
        # 5-10× the archetype's legit p95.
        "STUDENT":            {"amount_range": (1_500,   5_000)},
        "YOUNG_PROFESSIONAL": {"amount_range": (8_000,   25_000)},
        "RETIREE":            {"amount_range": (3_000,   8_000)},
        "BUSINESS_OWNER":     {"amount_range": (50_000,  200_000)},
        "HIGH_NET_WORTH":     {"amount_range": (150_000, 500_000)},
        "INFREQUENT_USER":    {"amount_range": (2_000,   8_000)},
        "NIGHT_WORKER":       {"amount_range": (8_000,   25_000)},
    },
    "SLOW_DRAIN": {
        # Each transfer ~ archetype p90 (above typical but not single-tx alarming).
        "STUDENT":            {"amount_range": (200,    800)},
        "YOUNG_PROFESSIONAL": {"amount_range": (1_000,  4_000)},
        "RETIREE":            {"amount_range": (500,    2_000)},
        "BUSINESS_OWNER":     {"amount_range": (8_000,  25_000)},
        "HIGH_NET_WORTH":     {"amount_range": (25_000, 80_000)},
        "INFREQUENT_USER":    {"amount_range": (300,    1_500)},
        "NIGHT_WORKER":       {"amount_range": (800,    3_000)},
    },
    "SAVINGS_FRAUD": {
        # Only the BOTH-account archetypes — others are skipped before injection.
        "BUSINESS_OWNER":     {"amount_range": (15_000, 60_000)},
        "HIGH_NET_WORTH":     {"amount_range": (40_000, 200_000)},
    },
    "TROJAN_TAKEOVER": {
        # Setup amounts sit at archetype-typical (so they blend in); drain
        # amounts are 5-30× the archetype median (sudden out-of-character spike).
        "STUDENT":            {"setup_amount_range": (50,    200),
                               "drain_amount_range": (2_000, 8_000)},
        "YOUNG_PROFESSIONAL": {"setup_amount_range": (100,   600),
                               "drain_amount_range": (8_000, 30_000)},
        "RETIREE":            {"setup_amount_range": (50,    300),
                               "drain_amount_range": (1_500, 6_000)},
        "BUSINESS_OWNER":     {"setup_amount_range": (500,   2_500),
                               "drain_amount_range": (30_000, 100_000)},
        "HIGH_NET_WORTH":     {"setup_amount_range": (1_000, 5_000),
                               "drain_amount_range": (80_000, 300_000)},
        "INFREQUENT_USER":    {"setup_amount_range": (50,    200),
                               "drain_amount_range": (1_500, 6_000)},
        "NIGHT_WORKER":       {"setup_amount_range": (100,   600),
                               "drain_amount_range": (8_000, 30_000)},
    },
}


def _victim_overrides(fraud_archetype: str, victim_archetype: str) -> dict:
    """Lookup fraud parameters for (fraud, victim). Falls back to a default victim
    so an unknown archetype doesn't crash injection."""
    fraud_table = FRAUD_OVERRIDES.get(fraud_archetype, {})
    return fraud_table.get(victim_archetype, fraud_table.get(_DEFAULT_VICTIM, {}))


def _pick_seed_user(active_users: pd.DataFrame, rng: np.random.Generator) -> pd.Series:
    return active_users.iloc[int(rng.integers(0, len(active_users)))]


def _build_base_row(
    seed_user: pd.Series,
    accounts_by_cin: dict,
    ts: pd.Timestamp,
    rng: np.random.Generator,
    *,
    archetype: str,
    amount: float,
    dest_cin: str | None = None,
    dest_account_override: str | None = None,
    source_type_override: str | None = None,
    is_balance_zero_receiver: bool = False,
    prefer_new_dest: bool = False,
) -> dict:
    sender_cin = seed_user["cin"]
    source_accounts = accounts_by_cin.get(sender_cin)
    if source_accounts is None or len(source_accounts) == 0:
        raise ValueError(f"No accounts found for sender CIN {sender_cin}")

    if source_type_override:
        candidates = source_accounts[source_accounts["type"] == source_type_override]
        source = candidates.iloc[0] if len(candidates) > 0 else source_accounts.iloc[0]
    else:
        source = source_accounts.iloc[0]

    if dest_account_override:
        dest_account = dest_account_override
        dest_bank = "ATB"
        dest_opened_at = pd.Timestamp("1970-01-01", tz="UTC")
    else:
        other_cins = [c for c in accounts_by_cin.keys() if c != sender_cin]
        chosen_cin = None
        chosen_row = None
        if prefer_new_dest:
            cutoff = pd.Timestamp(ts) - pd.Timedelta(days=90)
            for _ in range(5):
                pick = other_cins[int(rng.integers(0, len(other_cins)))]
                row = accounts_by_cin[pick].iloc[0]
                opened = pd.Timestamp(row["opened_at"])
                if opened.tz is None:
                    opened = opened.tz_localize("UTC")
                if opened >= cutoff.tz_convert(opened.tz):
                    chosen_cin = pick
                    chosen_row = row
                    break
        if chosen_cin is None:
            chosen_cin = dest_cin or other_cins[int(rng.integers(0, len(other_cins)))]
            chosen_row = accounts_by_cin[chosen_cin].iloc[0]
        dest_account = chosen_row["account_number"]
        dest_bank = chosen_row["bank_code"]
        dest_cin = chosen_cin
        dest_opened_at = pd.Timestamp(chosen_row["opened_at"])
        if dest_opened_at.tz is None:
            dest_opened_at = dest_opened_at.tz_localize("UTC")

    receiver_balance = 0.0 if is_balance_zero_receiver else float(
        rng.uniform(50, 5_000)
    )
    source_balance_before = max(
        float(source["balance"]) * float(rng.uniform(0.8, 1.4)),
        amount + 100.0,
    )

    return {
        "id": str(uuid.uuid4()),
        "reference": f"TRX-{ts.strftime('%Y%m%d')}-{uuid.uuid4().hex[:6].upper()}",
        "client_id": seed_user["id"],
        "source_account_number": source["account_number"],
        "destination_account_number": dest_account,
        "source_bank_code": source["bank_code"],
        "dest_bank_code": dest_bank,
        "dest_client_cin": dest_cin,
        "amount": round(amount, 2),
        "motif": None,
        "status": "APPROVED",
        "risk_score": None,
        "risk_level": None,
        "source_balance_before": round(source_balance_before, 2),
        "dest_balance_before": round(receiver_balance, 2),
        "created_at": ts,
        "updated_at": ts,
        "otp_confirmed_at": ts,
        "executed_at": ts,
        "is_fraud": np.int8(1),
        "fraud_archetype": archetype,
        "source_account_type": source["type"],
        "sender_governorate": seed_user["governorate"],
        "receiver_governorate": None,
        "sender_account_created_at": seed_user["created_at"],
        "dest_account_opened_at": dest_opened_at,
        # v5: denorm the sender_archetype on fraud rows too, matching legit tx.
        "sender_archetype": seed_user.get("archetype", _DEFAULT_VICTIM),
    }


def _draw_off_hour(rng: np.random.Generator, off_hours: list[int]) -> int:
    return int(rng.choice(off_hours))


def _inject_takeover(seed_user, accounts_by_cin, dataset_start, dataset_end, rng):
    """N long-distance, victim-archetype-anomalous-amount transfers in 6h window."""
    victim = seed_user.get("archetype", _DEFAULT_VICTIM)
    o = _victim_overrides("TAKEOVER", victim)
    n_lo, n_hi = o.get("n_range", (1, 3))
    amt_lo, amt_hi = o["amount_range"]
    off_hours = _off_hours(victim)

    n = int(rng.integers(n_lo, n_hi + 1))
    span = (dataset_end - dataset_start).total_seconds()
    burst_start = dataset_start + pd.Timedelta(seconds=int(rng.integers(span * 0.01, span * 0.99)))

    rows = []
    for _ in range(n):
        # 75% off-hours for victim (out of character), 25% in-hours (sometimes
        # attacks happen during normal hours and only the AMOUNT is the giveaway).
        if rng.random() < 0.75:
            hour = _draw_off_hour(rng, off_hours)
        else:
            hour = int(rng.integers(0, 24))
        offset = pd.Timedelta(hours=int(rng.integers(0, 6)), minutes=int(rng.integers(0, 60)))
        ts = (burst_start + offset).replace(hour=hour, minute=int(rng.integers(0, 60)))

        pair = LONG_DISTANCE_PAIRS[int(rng.integers(0, len(LONG_DISTANCE_PAIRS)))]
        sender_gov, receiver_gov = (pair if rng.random() < 0.5 else pair[::-1])

        amount = float(rng.uniform(amt_lo, amt_hi))
        is_zero_receiver = rng.random() < 0.5
        row = _build_base_row(
            seed_user, accounts_by_cin, ts, rng,
            archetype="TAKEOVER",
            amount=amount,
            is_balance_zero_receiver=is_zero_receiver,
            prefer_new_dest=True,
        )
        row["sender_governorate"] = sender_gov
        row["receiver_governorate"] = receiver_gov
        rows.append(row)
    return rows


def _inject_card_testing(seed_user, accounts_by_cin, dataset_start, dataset_end, rng):
    """N small transfers in 30..90 min to distinct fresh destinations. BUSINESS_OWNER
    gets a much larger N (50-200) to exceed even the coffee-shop velocity envelope."""
    victim = seed_user.get("archetype", _DEFAULT_VICTIM)
    o = _victim_overrides("CARD_TESTING", victim)
    n_lo, n_hi = o["n_range"]
    amt_lo, amt_hi = o["amount_range"]

    n = int(rng.integers(n_lo, n_hi + 1))
    span = (dataset_end - dataset_start).total_seconds()
    burst_start = dataset_start + pd.Timedelta(seconds=int(rng.integers(span * 0.01, span * 0.99)))
    other_cins = [c for c in accounts_by_cin.keys() if c != seed_user["cin"]]
    if len(other_cins) < n:
        n = len(other_cins)
    targets = rng.choice(other_cins, size=n, replace=False)

    rows = []
    burst_window_min = int(rng.integers(30, 91))
    for i, tgt in enumerate(targets):
        ts = burst_start + pd.Timedelta(minutes=int(burst_window_min * i / max(n - 1, 1)))
        amount = float(rng.uniform(amt_lo, amt_hi))
        row = _build_base_row(
            seed_user, accounts_by_cin, ts, rng,
            archetype="CARD_TESTING",
            amount=amount,
            dest_cin=tgt,
            prefer_new_dest=True,
        )
        rows.append(row)
    return rows


def _inject_large_unusual(seed_user, accounts_by_cin, dataset_start, dataset_end, rng):
    """Single large transfer to a fresh dest, sized 5-10× the victim archetype's p95."""
    victim = seed_user.get("archetype", _DEFAULT_VICTIM)
    o = _victim_overrides("LARGE_UNUSUAL", victim)
    amt_lo, amt_hi = o["amount_range"]
    off_hours = _off_hours(victim)

    span = (dataset_end - dataset_start).total_seconds()
    ts = dataset_start + pd.Timedelta(seconds=int(rng.integers(span * 0.01, span * 0.99)))
    # 50% off-hours bias — large amounts at off-hours are the classic combo.
    if rng.random() < 0.5:
        hour = _draw_off_hour(rng, off_hours)
        ts = ts.replace(hour=hour, minute=int(rng.integers(0, 60)))

    amount = float(rng.uniform(amt_lo, amt_hi))
    row = _build_base_row(
        seed_user, accounts_by_cin, ts, rng,
        archetype="LARGE_UNUSUAL",
        amount=amount,
        prefer_new_dest=True,
    )
    return [row]


def _inject_slow_drain(seed_user, accounts_by_cin, dataset_start, dataset_end, rng):
    """4..8 medium transfers spread over 3..7 days, each amount sized to the victim."""
    victim = seed_user.get("archetype", _DEFAULT_VICTIM)
    o = _victim_overrides("SLOW_DRAIN", victim)
    amt_lo, amt_hi = o["amount_range"]

    n = int(rng.integers(4, 9))
    span_days = int(rng.integers(3, 8))
    span = (dataset_end - dataset_start).total_seconds()
    drain_start = dataset_start + pd.Timedelta(
        seconds=int(rng.integers(span * 0.01, span * 0.99 - span_days * 86_400))
    )
    rows = []
    for i in range(n):
        offset_days = (span_days * i / max(n - 1, 1)) + float(rng.uniform(-0.5, 0.5))
        ts = drain_start + pd.Timedelta(days=offset_days, hours=int(rng.integers(0, 24)))
        amount = float(rng.uniform(amt_lo, amt_hi))
        row = _build_base_row(
            seed_user, accounts_by_cin, ts, rng,
            archetype="SLOW_DRAIN",
            amount=amount,
        )
        rows.append(row)
    return rows


def _inject_savings_fraud(seed_user, accounts_by_cin, dataset_start, dataset_end, rng):
    """Large transfer from a SAVINGS account, off-hours bias. SKIPPED if the
    victim's archetype doesn't typically have a SAVINGS account, or if their
    specific accounts dict has no SAVINGS entry."""
    victim = seed_user.get("archetype", _DEFAULT_VICTIM)
    if victim not in _SAVINGS_OK_ARCHETYPES:
        return []  # inject_fraud loop re-rolls archetype

    # Defensive: check actual accounts. BUSINESS_OWNER might still randomly
    # have only CHECKING in this run — skip rather than mislabel.
    user_accounts = accounts_by_cin.get(seed_user["cin"])
    if user_accounts is None or (user_accounts["type"] == "SAVINGS").sum() == 0:
        return []

    o = _victim_overrides("SAVINGS_FRAUD", victim)
    amt_lo, amt_hi = o["amount_range"]
    off_hours = _off_hours(victim)

    span = (dataset_end - dataset_start).total_seconds()
    ts = dataset_start + pd.Timedelta(seconds=int(rng.integers(span * 0.01, span * 0.99)))
    # 60% off-hours.
    if rng.random() < 0.6:
        hour = _draw_off_hour(rng, off_hours)
        ts = ts.replace(hour=hour, minute=int(rng.integers(0, 60)))

    amount = float(rng.uniform(amt_lo, amt_hi))
    row = _build_base_row(
        seed_user, accounts_by_cin, ts, rng,
        archetype="SAVINGS_FRAUD",
        amount=amount,
        source_type_override="SAVINGS",
    )
    return [row]


def _resolve_mule_destination(seed_user, accounts_by_cin, ts, rng):
    """Pick a fresh mule destination — accounts opened in the last 180 days
    preferred, falls back to any random account."""
    other_cins = [c for c in accounts_by_cin.keys() if c != seed_user["cin"]]
    cutoff = pd.Timestamp(ts) - pd.Timedelta(days=180)
    for _ in range(8):
        pick = other_cins[int(rng.integers(0, len(other_cins)))]
        row = accounts_by_cin[pick].iloc[0]
        opened = pd.Timestamp(row["opened_at"])
        if opened.tz is None:
            opened = opened.tz_localize("UTC")
        if opened >= cutoff.tz_convert(opened.tz):
            return pick, row
    pick = other_cins[int(rng.integers(0, len(other_cins)))]
    return pick, accounts_by_cin[pick].iloc[0]


def _inject_trojan_takeover(seed_user, accounts_by_cin, dataset_start, dataset_end, rng):
    """DEEP trojan: N setup transfers at archetype-typical amounts (blends in),
    then 1-3 drain transfers at archetype-out-of-character amounts at off-hours.

    Setup transfers SHARE the victim's typical hour distribution (look benign),
    drain transfers fire in off-hours (out of character)."""
    victim = seed_user.get("archetype", _DEFAULT_VICTIM)
    o = _victim_overrides("TROJAN_TAKEOVER", victim)
    setup_lo, setup_hi = o["setup_amount_range"]
    drain_lo, drain_hi = o["drain_amount_range"]
    off_hours = _off_hours(victim)

    span = (dataset_end - dataset_start).total_seconds()
    setup_window_days = int(rng.integers(7, 29))
    drain_offset_days = int(rng.integers(0, 4))
    total_window_secs = (setup_window_days + drain_offset_days + 1) * 86400
    setup_start = dataset_start + pd.Timedelta(
        seconds=int(rng.integers(span * 0.01, max(span * 0.95 - total_window_secs, span * 0.02)))
    )

    chosen_cin, chosen_row = _resolve_mule_destination(seed_user, accounts_by_cin, setup_start, rng)
    mule_account = chosen_row["account_number"]
    mule_bank = chosen_row["bank_code"]
    mule_opened = pd.Timestamp(chosen_row["opened_at"])
    if mule_opened.tz is None:
        mule_opened = mule_opened.tz_localize("UTC")

    rows = []

    # Phase A: 2-5 small "trust-building" transfers at archetype-typical hours.
    n_setup = int(rng.integers(2, 6))
    setup_amounts = rng.uniform(setup_lo, setup_hi, size=n_setup)
    base_offsets = np.linspace(0, setup_window_days, n_setup) + rng.uniform(-0.5, 0.5, size=n_setup)
    for i in range(n_setup):
        offset_days = max(0.0, float(base_offsets[i]))
        ts = setup_start + pd.Timedelta(days=offset_days)
        # Setup blends in: pick from victim's typical hours (not off-hours).
        # 90% in-hours, 10% off (slight randomization).
        if rng.random() < 0.10:
            hour = _draw_off_hour(rng, off_hours)
        else:
            hour = int(rng.integers(8, 20))
        ts = ts.replace(hour=hour, minute=int(rng.integers(0, 60)))
        row = _build_base_row(
            seed_user, accounts_by_cin, ts, rng,
            archetype="TROJAN_TAKEOVER",
            amount=float(setup_amounts[i]),
            dest_cin=chosen_cin,
        )
        row["destination_account_number"] = mule_account
        row["dest_bank_code"] = mule_bank
        row["dest_account_opened_at"] = mule_opened
        rows.append(row)

    # Phase B: 1-3 large drain transfers at off-hours (out of character).
    drain_start = setup_start + pd.Timedelta(days=setup_window_days + drain_offset_days)
    n_drain = int(rng.integers(2, 5))
    for _ in range(n_drain):
        ts = drain_start + pd.Timedelta(minutes=int(rng.integers(0, 6 * 60)))
        # 80% off-hours for drain.
        if rng.random() < 0.80:
            hour = _draw_off_hour(rng, off_hours)
            ts = ts.replace(hour=hour, minute=int(rng.integers(0, 60)))
        amount = float(rng.uniform(drain_lo, drain_hi))
        row = _build_base_row(
            seed_user, accounts_by_cin, ts, rng,
            archetype="TROJAN_TAKEOVER",
            amount=amount,
            dest_cin=chosen_cin,
            is_balance_zero_receiver=rng.random() < 0.3,
        )
        row["destination_account_number"] = mule_account
        row["dest_bank_code"] = mule_bank
        row["dest_account_opened_at"] = mule_opened
        rows.append(row)

    return rows


# SUSTAINED_ESCALATION is no longer in training.yaml fraud_mix (dropped in v4.2
# because its slow ramp confused the model). Kept in the codebase for forward
# compat — would need a FRAUD_OVERRIDES entry before re-enabling.
def _inject_sustained_escalation(seed_user, accounts_by_cin, dataset_start, dataset_end, rng):
    """Disabled in v5 — see comment above. Returns empty list."""
    return []


_ARCHETYPE_INJECTORS = {
    "TAKEOVER":             _inject_takeover,
    "CARD_TESTING":         _inject_card_testing,
    "LARGE_UNUSUAL":        _inject_large_unusual,
    "SLOW_DRAIN":           _inject_slow_drain,
    "SAVINGS_FRAUD":        _inject_savings_fraud,
    "TROJAN_TAKEOVER":      _inject_trojan_takeover,
    "SUSTAINED_ESCALATION": _inject_sustained_escalation,
}


def inject_fraud(
    legit_df: pd.DataFrame,
    users_df: pd.DataFrame,
    accounts_df: pd.DataFrame,
    n_fraud_target: int,
    archetype_mix: dict[str, float],
    dataset_start: pd.Timestamp,
    dataset_end: pd.Timestamp,
    rng: np.random.Generator,
) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Inject fraud rows into legit_df and return (combined_df, fraud_alerts_df).

    Fraud parameters are drawn from FRAUD_OVERRIDES[fraud_archetype][victim_archetype]
    so the same fraud archetype produces different rows for different victims.
    SAVINGS_FRAUD is skipped on victims without a SAVINGS account.
    """
    active_users = users_df[users_df["status"] == "ACTIVE"].reset_index(drop=True)
    accounts_by_cin = {
        cin: group.reset_index(drop=True)
        for cin, group in accounts_df.groupby("client_cin", sort=False)
    }

    fraud_rows: list[dict] = []
    archetype_counter = {a: 0 for a in ARCHETYPES}
    skipped_savings = 0
    max_iters = n_fraud_target * 10  # safety cap if SAVINGS_FRAUD keeps skipping
    iters = 0

    while len(fraud_rows) < n_fraud_target and iters < max_iters:
        iters += 1
        archetype = rng.choice(
            list(archetype_mix.keys()),
            p=np.array(list(archetype_mix.values())) / sum(archetype_mix.values()),
        )
        seed_user = _pick_seed_user(active_users, rng)
        injector = _ARCHETYPE_INJECTORS[archetype]
        new_rows = injector(seed_user, accounts_by_cin, dataset_start, dataset_end, rng)
        if not new_rows:
            if archetype == "SAVINGS_FRAUD":
                skipped_savings += 1
            continue
        for r in new_rows:
            fraud_rows.append(r)
            archetype_counter[archetype] += 1
            if len(fraud_rows) >= n_fraud_target:
                break

    if skipped_savings:
        print(f"  [fraud] skipped {skipped_savings} SAVINGS_FRAUD attempts on non-eligible victims")

    fraud_df = pd.DataFrame(fraud_rows)

    for col in ("created_at", "updated_at", "otp_confirmed_at", "executed_at",
                "sender_account_created_at"):
        if col in fraud_df.columns:
            fraud_df[col] = pd.to_datetime(fraud_df[col], utc=True)

    cin_to_gov = users_df.set_index("cin")["governorate"]
    fraud_df["receiver_governorate"] = (
        fraud_df["receiver_governorate"]
        .fillna(fraud_df["dest_client_cin"].map(cin_to_gov))
    )

    accnum_to_bank = accounts_df.set_index("account_number")["bank_code"]
    fraud_df["dest_bank_code"] = (
        fraud_df["destination_account_number"].map(accnum_to_bank)
        .fillna(fraud_df["dest_bank_code"])
    )

    alert_statuses = rng.choice(
        ["VALIDATED", "REJECTED"], size=len(fraud_df), p=[0.9, 0.1]
    )
    trust_deltas = np.where(alert_statuses == "VALIDATED", -15, 3).astype("int32")

    fraud_alerts_df = pd.DataFrame({
        "id":              [str(uuid.uuid4()) for _ in range(len(fraud_df))],
        "transaction_id":  fraud_df["id"].to_numpy(),
        "analyst_id":      None,
        "status":          alert_statuses,
        "ml_reasons":      [["Synthetic fraud row"] for _ in range(len(fraud_df))],
        "analyst_comment": None,
        "trust_delta":     trust_deltas,
        "decided_at":      fraud_df["created_at"] + pd.Timedelta(hours=2),
        "created_at":      fraud_df["created_at"],
    })

    combined = pd.concat([legit_df, fraud_df], ignore_index=True)
    combined = combined.sort_values("created_at").reset_index(drop=True)
    return combined, fraud_alerts_df
