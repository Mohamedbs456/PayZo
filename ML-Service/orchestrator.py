"""3-tier orchestrator — dispatch + logging.

Routes an incoming score request through:
    Tier 1 (XGBoost) ──[low confidence or error]── Tier 2 (LR) ──[error]── Tier 3 (Rules) ──[error]── Stub

Stateless. The Java backend is the system of record for risk_score/risk_level
persistence; the orchestrator only logs a structured event per decision.
"""
from __future__ import annotations

import logging
import time
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import TYPE_CHECKING

import numpy as np
import pandas as pd
import yaml

from feature_engineering import OUTPUT_FEATURE_NAMES, build_pipeline
from tier1_main_model import Tier1Loader
from tier2_fallback_model import Tier2Loader
from tier3_rule_firewall import RuleFirewall
from stub.stub_scorer import stub_score_from_log_amount

if TYPE_CHECKING:
    from app.schemas import ScoreRequest

logger = logging.getLogger("payzo.ml.orchestrator")

# Maps Tier 3 rule decision back to a synthetic risk score so the Java side's
# 0..1 expectation is preserved.
TIER3_DECISION_TO_SCORE = {"ALLOW": 0.10, "REVIEW": 0.50, "BLOCK": 0.85}


@dataclass
class FraudDecision:
    transactionId: str
    riskScore: float
    decision: str          # ALLOW | REVIEW | BLOCK
    tier: str              # TIER1 | TIER2 | TIER3 | STUB
    riskLevel: str         # LOW | MEDIUM | HIGH (from ThresholdManager)
    reasons: list[str] = field(default_factory=list)
    ruleFired: list[str] = field(default_factory=list)
    latencyMs: int = 0
    modelVersion: str = "unknown"

    def to_dict(self) -> dict:
        return asdict(self)


def _request_to_feature_row(req: "ScoreRequest") -> pd.DataFrame:
    """Map the camelCase v5 request DTO into a single-row DataFrame keyed by
    the snake_case feature names the pipeline expects.

    Mirrors `app.features._request_to_row` — keep both in sync. The duplication
    exists because orchestrator is the training-side entrypoint (via train.py
    e2e_smoke) and app/features.py is the serving-side entrypoint, and we want
    each to import its own dependencies.
    """
    return pd.DataFrame([{
        # Population-relative (15)
        "log_amount":                     req.logAmount,
        "amount_to_balance_ratio":        req.amountToBalanceRatio,
        "is_balance_zero_receiver":       req.isBalanceZeroReceiver,
        "distance_km":                    req.distanceKm,
        "hour_of_day":                    int(req.hourOfDay),
        "sender_tx_count_24h":            req.senderTxCount24h,
        "sender_amount_sum_24h":          req.senderAmountSum24h,
        "sender_distinct_dest_24h":       req.senderDistinctDest24h,
        "sender_account_age_days":        req.senderAccountAgeDays,
        "is_sender_new_account":          req.isSenderNewAccount,
        "trust_score":                    req.trustScore,
        "is_known_beneficiary":           req.isKnownBeneficiary,
        "transfers_to_dest_lifetime":     req.transfersToDestLifetime,
        "is_dest_new_account":            req.isDestNewAccount,
        "days_since_last_transaction":    req.daysSinceLastTransaction,
        # Per-user-norm (8)
        "amount_z_score_user_30d":          req.amountZScoreUser30d,
        "amount_pct_of_user_max_lifetime":  req.amountPctOfUserMaxLifetime,
        "hour_likelihood_for_user":         req.hourLikelihoodForUser,
        "dest_familiarity_score":           req.destFamiliarityScore,
        "velocity_relative_to_user_norm":   req.velocityRelativeToUserNorm,
        "weekday_typical_for_user":         req.weekdayTypicalForUser,
        "account_type_typical_for_user":    req.accountTypeTypicalForUser,
        "days_since_user_account_anomaly":  req.daysSinceUserAccountAnomaly,
        # Categorical
        "account_type":                   req.accountType,
    }])


class Orchestrator:
    def __init__(
        self,
        tier1: Tier1Loader,
        tier2: Tier2Loader,
        tier3: RuleFirewall,
        threshold_mgr,
        feature_pipeline=None,
        training_config: dict | None = None,
    ):
        self.tier1 = tier1
        self.tier2 = tier2
        self.tier3 = tier3
        self.threshold_mgr = threshold_mgr
        self.feature_pipeline = feature_pipeline
        self.training_config = training_config or {}

        # v5: decisions live at the top level of training.yaml (no more tier1.decisions).
        decisions = self.training_config.get("decisions", {})
        self.allow_max = float(decisions.get("allow_max", 0.30))
        self.block_min = float(decisions.get("block_min", 0.70))
        self.confidence_floor = float(decisions.get("confidence_floor", 0.05))

    # ----------------------------------------------------------------- #
    # Public scoring entrypoints
    # ----------------------------------------------------------------- #
    def score(self, req: "ScoreRequest") -> FraudDecision:
        return self._dispatch(req, skip_tier1=False)

    def score_skip_tier1(self, req: "ScoreRequest") -> FraudDecision:
        """Backup-endpoint variant — forces Tier 2 → Tier 3 → Stub chain."""
        return self._dispatch(req, skip_tier1=True)

    # ----------------------------------------------------------------- #
    # Internal dispatch
    # ----------------------------------------------------------------- #
    def _dispatch(self, req: "ScoreRequest", *, skip_tier1: bool) -> FraudDecision:
        t0 = time.monotonic()
        features = self._build_features(req)

        # ----- Tier 1 ----------------------------------------------------
        if not skip_tier1 and self.tier1.is_loaded:
            try:
                proba = self.tier1.predict(features)
                if abs(proba - 0.5) >= self.confidence_floor:
                    return self._finalize(req, proba, "TIER1", self.tier1.model_version, t0)
                logger.info("Tier1 low confidence (%.4f) — falling to Tier 2", proba)
            except Exception as e:
                logger.warning("Tier1 failed: %s", e, exc_info=True)

        # ----- Tier 2 ----------------------------------------------------
        if self.tier2.is_loaded:
            try:
                proba = self.tier2.predict(features)
                return self._finalize(req, proba, "TIER2", self.tier2.model_version, t0)
            except Exception as e:
                logger.warning("Tier2 failed: %s", e, exc_info=True)

        # ----- Tier 3 ----------------------------------------------------
        try:
            feat_dict = {name: float(features[0, i]) for i, name in enumerate(OUTPUT_FEATURE_NAMES)}
            verdict = self.tier3.evaluate(feat_dict, req.model_dump() if hasattr(req, "model_dump") else {})
            proba = TIER3_DECISION_TO_SCORE[verdict.decision]
            return self._finalize(
                req, proba, "TIER3", "tier3-rules-v1", t0,
                reasons_override=verdict.reasons,
                rule_fired=verdict.fired,
            )
        except Exception as e:
            logger.error("Tier3 failed: %s", e, exc_info=True)

        # ----- Stub of last resort --------------------------------------
        proba = stub_score_from_log_amount(req.logAmount)
        return self._finalize(req, proba, "STUB", "stub-v1", t0)

    def _build_features(self, req: "ScoreRequest") -> np.ndarray:
        row = _request_to_feature_row(req)
        if self.feature_pipeline is not None:
            return self.feature_pipeline.transform(row)
        # Fallback: cold start with no fitted pipeline — build one inline.
        pipeline = build_pipeline(scale_numeric=False)
        pipeline.fit(row)
        return pipeline.transform(row)

    def _finalize(
        self,
        req: "ScoreRequest",
        proba: float,
        tier: str,
        model_version: str,
        t0: float,
        reasons_override: list[str] | None = None,
        rule_fired: list[str] | None = None,
    ) -> FraudDecision:
        decision = self._decision_from_proba(proba)
        risk_level = self.threshold_mgr.classify(proba)
        latency_ms = int((time.monotonic() - t0) * 1000)

        from app.reasons import explain   # avoid circular import at module load
        reasons = reasons_override if reasons_override is not None else explain(req)

        logger.info(
            "score_decision tier=%s decision=%s risk_score=%.4f risk_level=%s "
            "latency_ms=%d tx=%s",
            tier, decision, proba, risk_level, latency_ms, req.transactionId,
        )

        return FraudDecision(
            transactionId=req.transactionId,
            riskScore=round(proba, 6),
            decision=decision,
            tier=tier,
            riskLevel=risk_level,
            reasons=reasons,
            ruleFired=rule_fired or [],
            latencyMs=latency_ms,
            modelVersion=model_version,
        )

    def _decision_from_proba(self, proba: float) -> str:
        if proba < self.allow_max:
            return "ALLOW"
        if proba >= self.block_min:
            return "BLOCK"
        return "REVIEW"


def build_orchestrator(config_path: str | Path = "config/training.yaml") -> Orchestrator:
    """Convenience constructor — loads all tier artifacts + config + pipeline."""
    from app.thresholds import ThresholdManager
    import joblib

    config = {}
    cfg_path = Path(config_path)
    if cfg_path.exists():
        config = yaml.safe_load(cfg_path.read_text()) or {}

    threshold_mgr = ThresholdManager()
    threshold_mgr.load()

    tier1 = Tier1Loader().load()
    tier2 = Tier2Loader().load()

    rules_path = (config.get("paths", {}) or {}).get("rules_yaml", "config/rules.yaml")
    tier3 = RuleFirewall().load(rules_path)

    feature_pipeline = None
    pipeline_path = Path("artifacts/feature_pipeline.pkl")
    if pipeline_path.exists():
        feature_pipeline = joblib.load(pipeline_path)

    return Orchestrator(
        tier1=tier1, tier2=tier2, tier3=tier3,
        threshold_mgr=threshold_mgr,
        feature_pipeline=feature_pipeline,
        training_config=config,
    )
