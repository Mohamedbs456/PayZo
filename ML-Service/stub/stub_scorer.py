import math


def stub_score_from_log_amount(log_amount: float) -> float:
    """Rule-based fallback matching backend's StubScorer.

    Accepts log_amount (log1p-transformed) and recovers the original
    amount via expm1 before applying threshold rules.
    """
    amount = math.expm1(log_amount)
    if amount > 10_000:
        return 0.85
    if amount > 2_000:
        return 0.50
    return 0.10
