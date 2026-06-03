"""Rule-based reason strings.

These short sentences are returned in `ScoreResponse.reasons` and end up on
`FraudAlert.ml_reasons` on the Java side. They are model-layer-independent so
analysts see consistent explanations whether Tier 1, Tier 2, Tier 3, or the
stub produced the score.

Mirrors `MlIntegrationService.stubReasons` on the Java side — keep both in
sync when adding new rules.
"""
from __future__ import annotations

import math

from app.schemas import ScoreRequest


def explain(req: ScoreRequest) -> list[str]:
    reasons: list[str] = []

    # Recover amount from logAmount = log1p(amount).
    amount = math.expm1(req.logAmount)
    if amount > 10_000:
        reasons.append("Amount exceeds 10 000 TND — high-value transfer")
    elif amount > 2_000:
        reasons.append("Amount exceeds 2 000 TND — medium-value transfer")

    if req.hourOfDay < 6 or req.hourOfDay >= 22:
        reasons.append("Initiated outside daytime hours (06:00–22:00)")
    if req.hourLikelihoodForUser < 0.02:
        reasons.append(
            f"This hour is unusual for this sender (likelihood {req.hourLikelihoodForUser:.1%})"
        )

    if req.isSenderNewAccount == 1:
        reasons.append("Sender's account is less than 30 days old")

    if req.senderTxCount24h >= 5:
        reasons.append(
            f"Sender has {req.senderTxCount24h} transactions in the last 24 hours"
        )

    if req.distanceKm >= 200:
        reasons.append(
            f"Sender and receiver governorates are {round(req.distanceKm):d} km apart"
        )

    if req.isBalanceZeroReceiver == 1:
        reasons.append("Receiver account had a zero balance before this transfer")

    if req.amountToBalanceRatio >= 0.8:
        reasons.append(
            "Transfer amount is "
            f"{req.amountToBalanceRatio:.0%} of the sender's available balance"
        )

    # New for 3-tier defense chain. Boxed types come through as None when the
    # Java side hasn't sent the field yet — skip silently in that case.
    if req.trustScore is not None and req.trustScore < 30:
        reasons.append("Sender trust score below 30 — low reputation")

    if req.accountType == "SAVINGS" and amount > 5_000:
        reasons.append("Large transfer originating from a SAVINGS account")

    # v5 per-user-norm reasons — surface only when the feature value flags
    # actual anomaly for this user, so analysts see the same reasons whether
    # Tier 1, 2, 3, or Stub ran.
    if req.isKnownBeneficiary == 1 and req.transfersToDestLifetime >= 5:
        reasons.append(
            f"Sender has paid this recipient {req.transfersToDestLifetime} times before"
        )
    if req.isDestNewAccount == 1:
        reasons.append("Destination account was opened less than 30 days ago")
    if req.amountZScoreUser30d >= 3.0:
        reasons.append(
            f"Amount is {req.amountZScoreUser30d:.1f}σ above this sender's 30-day average"
        )
    if req.amountPctOfUserMaxLifetime > 2.0:
        reasons.append(
            f"Amount is {req.amountPctOfUserMaxLifetime:.1f}× this sender's previous maximum"
        )
    if req.velocityRelativeToUserNorm >= 5.0:
        reasons.append(
            f"24h activity is {req.velocityRelativeToUserNorm:.1f}× this sender's normal rate"
        )
    if req.daysSinceUserAccountAnomaly < 7:
        reasons.append(
            f"This sender had another anomalous transfer {req.daysSinceUserAccountAnomaly} day(s) ago"
        )
    if req.daysSinceLastTransaction >= 90 and req.daysSinceLastTransaction != 999:
        reasons.append(
            f"Sender's previous transfer was {req.daysSinceLastTransaction} days ago — dormant account"
        )

    return reasons
