"""Tier 1 main-model loader — Phase 4.D unified.

Training moved to `candidates.train_candidate` + `promote.promote_top_two`,
which writes the winner to `artifacts/tier1_model.pkl`. This file just
re-exports a `Tier1Loader` (alias of the unified `candidates.TierLoader`) so
the existing app/model.py and orchestrator.py imports keep working.

Tier 1 can be any of: xgboost / lightgbm / catboost. The loader dispatches
inference by the algorithm field inside the joblib bundle.
"""
from __future__ import annotations

from pathlib import Path

from candidates import TierLoader

ARTIFACTS_DIR = Path("artifacts")
TIER1_MODEL_PATH = ARTIFACTS_DIR / "tier1_model.pkl"
TIER1_METRICS_PATH = ARTIFACTS_DIR / "tier1_metrics.json"
FEATURE_PIPELINE_PATH = ARTIFACTS_DIR / "feature_pipeline.pkl"


class Tier1Loader(TierLoader):
    def __init__(self):
        super().__init__(TIER1_MODEL_PATH, TIER1_METRICS_PATH)
