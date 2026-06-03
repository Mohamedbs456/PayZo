"""User behavioral archetypes for synthetic data generation.

Each archetype encodes a *persistent identity*: amount distribution, hour-of-day
pattern, day-of-week preference, typical destination pool size, and velocity
envelope. Users carry their archetype label only in the synthetic generator —
production never sees it; the model learns each user's baseline through the
per-user-norm features (`amount_z_score_user_30d`, `hour_likelihood_for_user`,
`velocity_relative_to_user_norm`, etc.) at inference time.

The 7 archetypes were chosen to span the behaviour space:
    STUDENT             — small amounts, evening hours, weekday-light velocity
    YOUNG_PROFESSIONAL  — mid amounts, work-hour peaks, salary day spike
    RETIREE             — small-mid amounts, daytime only, pension day spike
    BUSINESS_OWNER      — large amounts, wide hours, HIGH velocity (coffee-shop
                          counter-example — many tx/day is normal for them)
    HIGH_NET_WORTH      — very large amounts, irregular timing, low velocity
    INFREQUENT_USER     — small amounts, monthly cadence, near-zero baseline
    NIGHT_WORKER        — mid amounts, NIGHT hours peak (off-shift) — the
                          counter-example to a naive "3am = risky" rule

Out-of-character fraud (Phase 4.C) reads the victim's archetype to draw fraud
amounts/hours/dests that are anomalous *for that specific archetype*. A 5K TND
transfer at 3am is fraud for a STUDENT but normal-day for a BUSINESS_OWNER.
"""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np


@dataclass(frozen=True)
class ArchetypeProfile:
    """One archetype's complete behavioural fingerprint."""
    name: str
    share: float                              # population fraction (0..1)
    amount_logmu: float                       # lognormal μ for legit amounts (TND)
    amount_logsigma: float                    # lognormal σ for legit amounts
    hour_weights: np.ndarray                  # 24-vector, sums to 1.0
    dow_weights: np.ndarray                   # 7-vector (Mon=0..Sun=6), sums to 1.0
    frequent_dest_count_range: tuple[int, int]   # (min, max) saved destinations
    monthly_tx_avg: float                     # median tx/month per typical user
    activity_sigma: float                     # lognormal σ on per-user activity (heavy tail
                                              #  width — BUSINESS_OWNER uses a wide σ so the
                                              #  top-percentile users become coffee-shop scale)
    velocity_envelope_max: int                # max plausible tx/day (heavy tail cap)
    account_type_pref: str                    # "CHECKING" | "SAVINGS" | "BOTH"
    monthly_spike_day: int | None             # day-of-month with extra activity (None = no spike)

    def __post_init__(self) -> None:
        # Defensive sanity — catches a typo in a weight array before
        # downstream samplers explode.
        if not np.isclose(self.hour_weights.sum(), 1.0, atol=1e-3):
            raise ValueError(f"{self.name}.hour_weights sum={self.hour_weights.sum()} != 1.0")
        if not np.isclose(self.dow_weights.sum(), 1.0, atol=1e-3):
            raise ValueError(f"{self.name}.dow_weights sum={self.dow_weights.sum()} != 1.0")


def _normalize(arr: list[float]) -> np.ndarray:
    a = np.asarray(arr, dtype=np.float64)
    return a / a.sum()


# ────────────────────────────────────────────────────────────────────────────
# Hour weights (24 entries, Mon=0..Sun=6 DOW weights). Each row is a behavioural
# silhouette — STUDENT peaks evening, NIGHT_WORKER peaks 22-06, etc. The arrays
# are normalized inside __post_init__ so the raw weights just need to be
# proportional.
# ────────────────────────────────────────────────────────────────────────────

# STUDENT — evening/late peaks (18-23), weekday-heavy
_STUDENT_HOURS = _normalize([
    0.005, 0.005, 0.003, 0.002, 0.002, 0.003,   # 00-05
    0.010, 0.020, 0.025, 0.030, 0.035, 0.040,   # 06-11
    0.045, 0.040, 0.035, 0.040, 0.050, 0.065,   # 12-17
    0.090, 0.110, 0.120, 0.110, 0.080, 0.035,   # 18-23 ← evening peak
])
_STUDENT_DOW = _normalize([1.0, 1.0, 1.0, 1.0, 1.0, 0.6, 0.4])

# YOUNG_PROFESSIONAL — morning + lunch + evening peaks
_YP_HOURS = _normalize([
    0.003, 0.002, 0.002, 0.002, 0.003, 0.005,   # 00-05
    0.020, 0.045, 0.075, 0.085, 0.075, 0.080,   # 06-11 ← morning peak
    0.100, 0.080, 0.045, 0.040, 0.050, 0.075,   # 12-17 ← lunch peak
    0.085, 0.070, 0.045, 0.025, 0.012, 0.008,   # 18-23
])
_YP_DOW = _normalize([1.0, 1.0, 1.0, 1.0, 1.0, 0.5, 0.4])

# RETIREE — strictly 8-18, peaked midday
_RETIREE_HOURS = _normalize([
    0.002, 0.002, 0.002, 0.002, 0.002, 0.002,   # 00-05 (near zero)
    0.005, 0.025, 0.075, 0.110, 0.115, 0.095,   # 06-11 ← daytime ramp
    0.090, 0.075, 0.085, 0.095, 0.090, 0.060,   # 12-17
    0.040, 0.015, 0.005, 0.003, 0.002, 0.001,   # 18-23 (off by 19)
])
_RETIREE_DOW = _normalize([1.0, 1.0, 1.0, 1.0, 1.0, 0.6, 0.5])

# BUSINESS_OWNER — wide 6-23 with morning + evening payroll bias
_BUSINESS_HOURS = _normalize([
    0.005, 0.005, 0.005, 0.005, 0.005, 0.005,   # 00-05
    0.025, 0.045, 0.065, 0.075, 0.080, 0.085,   # 06-11
    0.080, 0.065, 0.055, 0.060, 0.070, 0.075,   # 12-17
    0.075, 0.060, 0.045, 0.025, 0.015, 0.010,   # 18-23
])
_BUSINESS_DOW = _normalize([1.0, 1.0, 1.0, 1.0, 1.0, 0.8, 0.4])

# HIGH_NET_WORTH — irregular, mid-afternoon + evening
_HNW_HOURS = _normalize([
    0.010, 0.005, 0.003, 0.002, 0.003, 0.005,   # 00-05
    0.020, 0.035, 0.050, 0.060, 0.055, 0.060,   # 06-11
    0.075, 0.060, 0.055, 0.060, 0.070, 0.080,   # 12-17
    0.075, 0.060, 0.050, 0.040, 0.025, 0.012,   # 18-23
])
_HNW_DOW = _normalize([1.0, 1.0, 1.0, 1.0, 1.0, 0.7, 0.5])

# INFREQUENT_USER — population-average pattern (kept generic)
_INFREQUENT_HOURS = _normalize([
    0.005, 0.003, 0.002, 0.002, 0.003, 0.005,   # 00-05
    0.012, 0.025, 0.045, 0.060, 0.065, 0.075,   # 06-11
    0.090, 0.075, 0.060, 0.055, 0.058, 0.070,   # 12-17
    0.080, 0.062, 0.045, 0.030, 0.020, 0.013,   # 18-23
])
_INFREQUENT_DOW = _normalize([1.0, 1.0, 1.0, 1.0, 1.0, 0.7, 0.4])

# NIGHT_WORKER — inverted: peak 22-06 (off-shift hours)
_NIGHTWORKER_HOURS = _normalize([
    0.090, 0.085, 0.080, 0.075, 0.065, 0.060,   # 00-05 ← night peak
    0.040, 0.020, 0.010, 0.008, 0.008, 0.010,   # 06-11 (sleeping)
    0.012, 0.010, 0.008, 0.010, 0.012, 0.015,   # 12-17 (sleeping/waking)
    0.025, 0.040, 0.060, 0.080, 0.095, 0.100,   # 18-23 ← rising into night peak
])
_NIGHTWORKER_DOW = _normalize([1.0, 1.0, 1.0, 1.0, 1.0, 0.5, 0.3])


# ────────────────────────────────────────────────────────────────────────────
# The 7 archetypes. Shares sum to 1.0. monthly_tx_avg drives the per-user
# activity weight in transactions.build_legit_transactions; the lognormal
# jitter on top can push BUSINESS_OWNER tail users past 100 tx/day (the
# coffee-shop scenario the jury demo hinges on).
# ────────────────────────────────────────────────────────────────────────────
ARCHETYPES: dict[str, ArchetypeProfile] = {
    "STUDENT": ArchetypeProfile(
        name="STUDENT",
        share=0.15,
        amount_logmu=4.5,           # exp(4.5) ≈ 90 TND median
        amount_logsigma=0.6,
        hour_weights=_STUDENT_HOURS,
        dow_weights=_STUDENT_DOW,
        frequent_dest_count_range=(5, 8),
        monthly_tx_avg=5.0,
        activity_sigma=0.5,
        velocity_envelope_max=5,
        account_type_pref="CHECKING",
        monthly_spike_day=None,
    ),
    "YOUNG_PROFESSIONAL": ArchetypeProfile(
        name="YOUNG_PROFESSIONAL",
        share=0.25,
        amount_logmu=6.0,           # exp(6.0) ≈ 400 TND median
        amount_logsigma=0.9,
        hour_weights=_YP_HOURS,
        dow_weights=_YP_DOW,
        frequent_dest_count_range=(10, 15),
        monthly_tx_avg=15.0,
        activity_sigma=0.7,
        velocity_envelope_max=15,
        account_type_pref="CHECKING",
        monthly_spike_day=1,        # salary day
    ),
    "RETIREE": ArchetypeProfile(
        name="RETIREE",
        share=0.12,
        amount_logmu=5.5,           # exp(5.5) ≈ 245 TND median
        amount_logsigma=0.7,
        hour_weights=_RETIREE_HOURS,
        dow_weights=_RETIREE_DOW,
        frequent_dest_count_range=(3, 6),
        monthly_tx_avg=4.0,
        activity_sigma=0.5,
        velocity_envelope_max=5,
        account_type_pref="CHECKING",
        monthly_spike_day=25,       # pension day
    ),
    "BUSINESS_OWNER": ArchetypeProfile(
        name="BUSINESS_OWNER",
        share=0.18,
        amount_logmu=7.5,           # exp(7.5) ≈ 1808 TND median
        amount_logsigma=1.2,
        hour_weights=_BUSINESS_HOURS,
        dow_weights=_BUSINESS_DOW,
        frequent_dest_count_range=(20, 40),
        monthly_tx_avg=20.0,        # median ~20/month, but heavy tail goes much further
        activity_sigma=1.8,         # ← wide σ → top 0.1% reach 200+ tx/month (coffee-shop scale)
        velocity_envelope_max=200,
        account_type_pref="BOTH",
        monthly_spike_day=28,       # end-of-month payroll
    ),
    "HIGH_NET_WORTH": ArchetypeProfile(
        name="HIGH_NET_WORTH",
        share=0.08,
        amount_logmu=9.0,           # exp(9.0) ≈ 8103 TND median
        amount_logsigma=1.0,
        hour_weights=_HNW_HOURS,
        dow_weights=_HNW_DOW,
        frequent_dest_count_range=(5, 10),
        monthly_tx_avg=8.0,
        activity_sigma=1.0,
        velocity_envelope_max=12,
        account_type_pref="BOTH",
        monthly_spike_day=None,
    ),
    "INFREQUENT_USER": ArchetypeProfile(
        name="INFREQUENT_USER",
        share=0.15,
        amount_logmu=5.0,           # exp(5.0) ≈ 148 TND median
        amount_logsigma=0.8,
        hour_weights=_INFREQUENT_HOURS,
        dow_weights=_INFREQUENT_DOW,
        frequent_dest_count_range=(0, 3),
        monthly_tx_avg=1.5,
        activity_sigma=0.4,
        velocity_envelope_max=3,
        account_type_pref="CHECKING",
        monthly_spike_day=None,
    ),
    "NIGHT_WORKER": ArchetypeProfile(
        name="NIGHT_WORKER",
        share=0.07,
        amount_logmu=6.0,           # exp(6.0) ≈ 400 TND median
        amount_logsigma=0.9,
        hour_weights=_NIGHTWORKER_HOURS,
        dow_weights=_NIGHTWORKER_DOW,
        frequent_dest_count_range=(8, 12),
        monthly_tx_avg=10.0,
        activity_sigma=0.6,
        velocity_envelope_max=12,
        account_type_pref="CHECKING",
        monthly_spike_day=None,
    ),
}


# Defensive sanity check at import time — fail loudly if shares drifted.
_total_share = sum(p.share for p in ARCHETYPES.values())
if not np.isclose(_total_share, 1.0, atol=1e-6):
    raise ValueError(f"ARCHETYPES shares sum to {_total_share}, must be 1.0")


ARCHETYPE_NAMES: list[str] = list(ARCHETYPES.keys())
ARCHETYPE_SHARES: np.ndarray = np.array([ARCHETYPES[n].share for n in ARCHETYPE_NAMES])


def sample_archetypes(n: int, rng: np.random.Generator) -> np.ndarray:
    """Sample n archetype labels weighted by their population share."""
    return rng.choice(ARCHETYPE_NAMES, size=n, p=ARCHETYPE_SHARES)


def get_profile(name: str) -> ArchetypeProfile:
    """Lookup an archetype profile by name. Raises KeyError on unknown."""
    return ARCHETYPES[name]
