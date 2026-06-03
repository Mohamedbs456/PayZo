"""Bank seed — 15 real Tunisian banks. Mirrors the Spring Boot DataInitializer.

The Java DataInitializer seeds the same 15 codes; we keep this list in sync so
the synthetic accounts table joins cleanly against the Spring `Bank` entity.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

import pandas as pd

BANK_DEFS: list[tuple[str, str]] = [
    ("ATB",    "Arab Tunisian Bank"),
    ("BNA",    "Banque Nationale Agricole"),
    ("STB",    "Société Tunisienne de Banque"),
    ("BIAT",   "Banque Internationale Arabe de Tunisie"),
    ("AB",     "Amen Bank"),
    ("BH",     "Banque de l'Habitat"),
    ("UIB",    "Union Internationale de Banques"),
    ("ATTIJ",  "Attijari Bank"),
    ("CIB",    "Banque de Tunisie"),
    ("ABC",    "Arab Banking Corporation"),
    ("BTK",    "Banque Tuniso-Koweitienne"),
    ("BTE",    "Banque Tuniso-Émiratie"),
    ("BFT",    "Banque Franco-Tunisienne"),
    ("ZB",     "Zitouna Bank"),
    ("ABK",    "Al Baraka Bank"),
]

# Bank-code distribution for synthetic accounts — weighted roughly by Tunisian
# market share. Big-3 commercial banks dominate.
BANK_CODE_WEIGHTS: dict[str, float] = {
    "BIAT":  0.18, "BNA":   0.14, "STB":  0.13, "ATB":  0.10, "AB":    0.09,
    "BH":    0.08, "UIB":   0.07, "ATTIJ":0.07, "CIB":  0.05, "ABC":   0.03,
    "BTK":   0.02, "BTE":   0.01, "BFT":  0.01, "ZB":   0.01, "ABK":   0.01,
}


def build_banks_dataframe(now: datetime | None = None) -> pd.DataFrame:
    """Return a DataFrame ready to write to banks.parquet."""
    epoch = now or datetime.now(timezone.utc)
    rows = []
    for code, name in BANK_DEFS:
        rows.append({
            "id": str(uuid.uuid4()),
            "name": name,
            "code": code,
            "logo_url": None,
            "active": True,
            "created_at": epoch,
            "updated_at": epoch,
        })
    return pd.DataFrame(rows)
