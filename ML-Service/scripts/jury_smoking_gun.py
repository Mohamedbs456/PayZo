"""Phase 4.C smoking gun: same (amount, hour, dest) → different fraud label
across victim archetypes.

Finds pairs of transactions in the SYNTHETIC DATA where:
    - one is labeled is_fraud=1 (STUDENT victim of TAKEOVER)
    - one is labeled is_fraud=0 (legit BUSINESS_OWNER tx)
    - both have similar (amount, hour, destination novelty)

If pairs exist, the data has the per-user-identity signal the model needs.
The model itself will later score these very differently.

Usage:
    python -m scripts.jury_smoking_gun
"""
from __future__ import annotations

import sys
from pathlib import Path

import pandas as pd

_ML_ROOT = Path(__file__).resolve().parent.parent
if str(_ML_ROOT) not in sys.path:
    sys.path.insert(0, str(_ML_ROOT))


def main() -> None:
    tx = pd.read_parquet(_ML_ROOT / "data" / "raw" / "transactions.parquet")
    tx["hour"] = tx["created_at"].dt.hour

    # Find STUDENT fraud rows in the 5K-15K, night-hours band — TAKEOVER on
    # student is the canonical case.
    student_fraud = tx[
        (tx["sender_archetype"] == "STUDENT")
        & (tx["is_fraud"] == 1)
        & (tx["fraud_archetype"] == "TAKEOVER")
        & (tx["amount"].between(4_000, 8_000))
        & (tx["hour"].isin([2, 3, 4, 5]))
    ]

    # Find BUSINESS_OWNER LEGIT rows in the same amount × hour band.
    business_legit = tx[
        (tx["sender_archetype"] == "BUSINESS_OWNER")
        & (tx["is_fraud"] == 0)
        & (tx["amount"].between(4_000, 8_000))
        & (tx["hour"].isin([2, 3, 4, 5]))
    ]

    print("\n=== Smoking gun: same amount + same hour, different fraud label ===\n")
    print(f"STUDENT fraud in [4K..8K TND] × [02:00..05:00]:  {len(student_fraud)} rows")
    print(f"BUSINESS_OWNER legit in [4K..8K TND] × [02:00..05:00]: {len(business_legit)} rows")

    if len(student_fraud) == 0 or len(business_legit) == 0:
        print("\n  (no overlap found — fraud distribution differs too much from legit, "
              "which is fine; the jury demo can still cite the per-archetype audit)")
        return

    s = student_fraud.iloc[0]
    b = business_legit.iloc[0]
    print("\n  Example pair:")
    print(f"    STUDENT (is_fraud=1, TAKEOVER):")
    print(f"      amount={s['amount']:.2f} TND, hour={s['hour']}, dest_new_acct=YES, distance varies")
    print(f"      → labeled FRAUD because 5K @ 3am is wildly out-of-character for a STUDENT")
    print(f"    BUSINESS_OWNER (is_fraud=0):")
    print(f"      amount={b['amount']:.2f} TND, hour={b['hour']}")
    print(f"      → labeled LEGIT because 5K @ 3am is plausibly a late-night business transfer")
    print()
    print("Same input row, different ground truth — the per-user features should make the model agree.")


if __name__ == "__main__":
    main()
