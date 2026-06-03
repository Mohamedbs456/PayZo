"""Synthetic PayZo client generator (~10K rows).

Produces a DataFrame matching `users.parquet` schema. Tunisian first/last names
are drawn from realistic local lists. Governorates are population-weighted.
Initial trust_score follows Beta(8, 2) × 100 (median ≈ 81, skewed high — most
users are "good actors" with reputation to lose).
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone, timedelta, date

import numpy as np
import pandas as pd

from data_generation.governorates import (
    GOVERNORATE_NAMES,
    GOVERNORATE_POPULATION_WEIGHTS,
)
from data_generation.user_archetypes import sample_archetypes

# 50 common Tunisian first names + 50 last names — keeps usernames believable.
FIRST_NAMES = [
    "Mohamed", "Ahmed", "Ali", "Youssef", "Omar", "Khaled", "Hamza", "Wassim",
    "Aymen", "Bilel", "Karim", "Nizar", "Sami", "Tarek", "Walid", "Yassine",
    "Anis", "Hatem", "Slim", "Mehdi", "Rami", "Mounir", "Fares", "Houssem",
    "Imed",
    "Fatma", "Aicha", "Khadija", "Maryam", "Salma", "Sarra", "Nour", "Yasmine",
    "Ines", "Amira", "Rania", "Sonia", "Leila", "Mouna", "Hanen", "Wafa",
    "Imen", "Olfa", "Sirine", "Asma", "Rim", "Dorra", "Ghada", "Nessrine",
    "Sabrine",
]
LAST_NAMES = [
    "Ben Salem", "Ben Ali", "Ben Yahya", "Ben Brahim", "Hammami", "Sassi",
    "Trabelsi", "Ferchichi", "Bouazizi", "Mejri", "Khelifi", "Mahjoubi",
    "Gharbi", "Chaouch", "Jebali", "Sfar", "Marzouki", "Maraoui", "Slimane",
    "Karoui", "Abdallah", "Romdhane", "Hamdi", "Belhaj", "Ayadi", "Cherni",
    "Zouari", "Ben Younes", "Ben Amor", "Ben Mansour", "Brahmi", "Mzoughi",
    "Toumi", "Ben Romdhane", "Hentati", "Aloui", "Slama", "Mabrouk", "Mhiri",
    "Naffati", "Belaid", "Khlifa", "Habib", "Mansouri", "Boubaker", "Saidi",
    "Khelil", "Karray", "Rejeb", "Brahem",
]

ADDRESS_STREETS = [
    "Avenue Habib Bourguiba", "Rue de la République", "Avenue Mohamed V",
    "Rue Ibn Khaldoun", "Avenue de France", "Rue Charles de Gaulle",
    "Avenue de la Liberté", "Rue de Carthage", "Avenue de Paris",
    "Rue Hedi Chaker", "Avenue Hedi Nouira", "Rue 7 Novembre",
    "Avenue Farhat Hached", "Rue Ali Bach Hamba", "Avenue de l'Indépendance",
]


def _random_dob(rng: np.random.Generator) -> date:
    # Age 18..70 at dataset epoch (today).
    days_old = int(rng.integers(18 * 365, 70 * 365))
    return (datetime.now(timezone.utc).date() - timedelta(days=days_old))


def build_users_dataframe(
    n_users: int,
    dataset_start: datetime,
    rng: np.random.Generator,
) -> pd.DataFrame:
    """Build a users DataFrame matching USERS_SCHEMA.

    `dataset_start` is the synthetic transaction window start (today - 12 months).
    60% of users are created before `dataset_start` (existing accounts), 40%
    are onboarded during the 12-month window (new sign-ups).
    """
    if n_users <= 0:
        raise ValueError("n_users must be positive")

    # Unique 8-digit CINs — sample with dedup instead of materializing
    # np.arange over a 90M pool (the np.arange path works but burns ~720 MB).
    cin_pool: set[int] = set()
    while len(cin_pool) < n_users:
        need = n_users - len(cin_pool)
        batch = rng.integers(10_000_000, 100_000_000, size=max(need * 2, 128))
        cin_pool.update(int(x) for x in batch)
    cin_pool = np.fromiter(cin_pool, dtype=np.int64, count=n_users)

    # Governorate weights (population-normalized).
    gov_keys = list(GOVERNORATE_POPULATION_WEIGHTS.keys())
    gov_weights = np.array([GOVERNORATE_POPULATION_WEIGHTS[g] for g in gov_keys])
    gov_weights = gov_weights / gov_weights.sum()
    governorates = rng.choice(gov_keys, size=n_users, p=gov_weights)

    first_names = rng.choice(FIRST_NAMES, size=n_users)
    last_names = rng.choice(LAST_NAMES, size=n_users)

    # Status distribution: 95% ACTIVE / 4% BLOCKED / 1% REJECTED.
    statuses = rng.choice(
        ["ACTIVE", "BLOCKED", "REJECTED"], size=n_users, p=[0.95, 0.04, 0.01]
    )

    # 60% created pre-dataset, 40% within the 12-month window.
    is_pre_dataset = rng.random(n_users) < 0.6
    pre_offsets = rng.integers(30, 5 * 365, size=n_users)        # 30d..5y before dataset_start
    in_offsets = rng.integers(0, 365, size=n_users)              # within 12 months
    created_at = np.where(
        is_pre_dataset,
        dataset_start - pd.to_timedelta(pre_offsets, unit="D"),
        dataset_start + pd.to_timedelta(in_offsets, unit="D"),
    )

    # Initial trust_score — Beta(8, 2) × 100 (median ≈ 81).
    trust_scores = np.clip(
        (rng.beta(8, 2, size=n_users) * 100).round().astype("int32"), 0, 100
    )

    # Persistent behavioural archetype — see data_generation/user_archetypes.py.
    # Drives amount/hour/dow/velocity distributions in transactions.py and
    # parameterizes victim-specific out-of-character fraud in fraud_archetypes.py.
    # Production never sees this column; it's a synthetic-generation device.
    archetypes = sample_archetypes(n_users, rng)

    ids = [str(uuid.uuid4()) for _ in range(n_users)]
    usernames = [
        f"{f.lower().replace(' ', '')}.{l.lower().replace(' ', '').replace('ben', 'b')}{i:05d}"
        for i, (f, l) in enumerate(zip(first_names, last_names))
    ]
    emails = [f"{u}@payzo.tn" for u in usernames]
    phones = [
        f"+216{int(rng.integers(20_000_000, 99_999_999))}" for _ in range(n_users)
    ]
    # datetime64[ns] for fastparquet compatibility — the Java side is LocalDate,
    # so anything at midnight UTC round-trips fine.
    dobs = pd.to_datetime([_random_dob(rng) for _ in range(n_users)])
    addresses = [
        f"{ADDRESS_STREETS[int(rng.integers(0, len(ADDRESS_STREETS)))]}, {g}"
        for g in governorates
    ]

    df = pd.DataFrame({
        "id": ids,
        "cin": [f"{int(c):08d}" for c in cin_pool],
        "username": usernames,
        "first_name": first_names,
        "last_name": last_names,
        "email": emails,
        "phone": phones,
        "governorate": governorates,
        "address": addresses,
        "date_of_birth": dobs,
        "status": statuses,
        "role": "CLIENT",
        "created_at": pd.to_datetime(created_at, utc=True),
        "updated_at": pd.to_datetime(created_at, utc=True),
        "trust_score": trust_scores,
        "default_account_id": None,    # populated later from accounts assignment
        "archetype": archetypes,
    })

    return df
