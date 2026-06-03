"""Inference API request / response schemas — v5 (Phase 4).

Wire-contract changes vs v4.2:
    REMOVED  isNight                          (subsumed by hourOfDay)
    REMOVED  destIsFavorite                   (low signal in v4, removed in v5)
    REMOVED  amountZScoreVsUserMedian         (24m median → replaced by 30d z-score)
    REMOVED  amountVsDestMaxPrior             (replaced by dest_familiarity_score)

    ADDED    amountZScoreUser30d              (amount - user_30d_mean) / max(σ, 1)
    ADDED    amountPctOfUserMaxLifetime       amount / max(user_lifetime_max, 1)
    ADDED    hourLikelihoodForUser            P(hour | user 30d histogram), α=5 smoothed
    ADDED    destFamiliarityScore             log(1+prior)/max(days_since_last, 1)
    ADDED    velocityRelativeToUserNorm       senderTxCount24h / max(30d avg/day, 0.1)
    ADDED    weekdayTypicalForUser            1 if today's DOW ≥ 1/14 of user's 30d, else 0
    ADDED    accountTypeTypicalForUser        1 if account_type matches user's 30d mode
    ADDED    daysSinceUserAccountAnomaly      days since user's last |z|>2 tx (999 if none)

Clean break: ml-service and payzo-backend deploy in lockstep via docker compose
so there is no rolling-deploy concern.
"""
from typing import Literal, Optional

from pydantic import BaseModel, Field, model_validator


class ScoreRequest(BaseModel):
    transactionId: str

    # Population-relative features (15) — same as v4.2 minus the two dropped.
    logAmount: float
    amountToBalanceRatio: float
    isBalanceZeroReceiver: int
    distanceKm: float
    hourOfDay: int = Field(..., ge=0, le=23)
    senderTxCount24h: int
    senderAmountSum24h: float
    senderDistinctDest24h: int
    senderAccountAgeDays: int
    isSenderNewAccount: int
    trustScore: int = Field(default=50, ge=0, le=100)
    isKnownBeneficiary: int = Field(default=0, ge=0, le=1)
    transfersToDestLifetime: int = Field(default=0, ge=0)
    isDestNewAccount: int = Field(default=0, ge=0, le=1)
    daysSinceLastTransaction: int = Field(default=999, ge=0)

    # Per-user-norm features (8) — see data_generation/per_user_features.py.
    # Defaults match the documented cold-start values so a brand-new client
    # without history doesn't crash the service.
    amountZScoreUser30d: float = 0.0
    amountPctOfUserMaxLifetime: float = 1.0
    hourLikelihoodForUser: float = Field(default=1.0 / 24, ge=0.0, le=1.0)
    destFamiliarityScore: float = 0.0
    velocityRelativeToUserNorm: float = 1.0
    weekdayTypicalForUser: int = Field(default=1, ge=0, le=1)
    accountTypeTypicalForUser: int = Field(default=1, ge=0, le=1)
    daysSinceUserAccountAnomaly: int = Field(default=999, ge=0)

    # Categorical (one-hot encoded as account_type_savings).
    accountType: Literal["CHECKING", "SAVINGS"] = "CHECKING"


class ScoreResponse(BaseModel):
    transactionId: str
    riskScore: float
    riskLevel: str
    modelVersion: str
    latencyMs: int
    shapValues: dict[str, float] | None = None
    reasons: list[str] = []
    tier: str | None = None              # "TIER1" | "TIER2" | "TIER3" | "STUB"
    decision: str | None = None          # "ALLOW" | "REVIEW" | "BLOCK"
    ruleFired: list[str] | None = None


class ThresholdUpdate(BaseModel):
    thresholdLowMedium: float
    thresholdMediumHigh: float

    @model_validator(mode="after")
    def validate_thresholds(self) -> "ThresholdUpdate":
        if not (0.0 < self.thresholdLowMedium < 1.0):
            raise ValueError("thresholdLowMedium must be between 0.0 and 1.0 (exclusive)")
        if not (0.0 < self.thresholdMediumHigh < 1.0):
            raise ValueError("thresholdMediumHigh must be between 0.0 and 1.0 (exclusive)")
        if self.thresholdLowMedium >= self.thresholdMediumHigh:
            raise ValueError("thresholdLowMedium must be less than thresholdMediumHigh")
        return self
