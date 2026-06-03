"""Tier 2 fallback-model loader — Phase 4.D unified.

Training moved to `candidates.train_candidate` + `promote.promote_top_two`,
which writes the winning bagging model to `artifacts/tier2_model.pkl`. This
file just re-exports a `Tier2Loader` (alias of `candidates.TierLoader`).

Tier 2 can be any of: random_forest / extra_trees.
"""
from __future__ import annotations

from pathlib import Path

from candidates import TierLoader

ARTIFACTS_DIR = Path("artifacts")
TIER2_MODEL_PATH = ARTIFACTS_DIR / "tier2_model.pkl"
TIER2_METRICS_PATH = ARTIFACTS_DIR / "tier2_metrics.json"


class Tier2Loader(TierLoader):
    def __init__(self):
        super().__init__(TIER2_MODEL_PATH, TIER2_METRICS_PATH)
