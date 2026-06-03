"""Tier-aware model manager.

Loads Tier 1 (XGBoost) and Tier 2 (calibrated LR) from their dedicated
artifact files. Exposes a single `is_loaded` flag (true if EITHER tier is
ready), the active model version (Tier 1 wins; falls back to Tier 2 then
stub), and direct accessors to the tier loaders for places that need them
(e.g. SHAP via the raw XGBoost booster).

The previous single-model artifact pattern (`artifacts/model.pkl` /
`artifacts/model.json`) is no longer used; train.py writes
`tier1_model.json` + `tier1_calibrator.pkl` + `tier2_model.pkl` and the
inference service reads from there.
"""
from __future__ import annotations

import numpy as np

from tier1_main_model import Tier1Loader
from tier2_fallback_model import Tier2Loader


class ModelManager:
    """Compatibility surface for `app/main.py`.

    Implements the historical attributes (`is_loaded`, `model_version`,
    `model`, `model_type`, `predict`) backed by the new Tier 1 + Tier 2
    loaders so legacy callers continue to work, while orchestrator-aware
    callers can reach `.tier1` / `.tier2` directly.
    """

    def __init__(self):
        self.tier1 = Tier1Loader()
        self.tier2 = Tier2Loader()

    # ----- Loading ---------------------------------------------------------
    def load(self) -> "ModelManager":
        self.tier1.load()
        self.tier2.load()
        return self

    # ----- Properties expected by app/main.py ------------------------------
    @property
    def is_loaded(self) -> bool:
        return self.tier1.is_loaded or self.tier2.is_loaded

    @property
    def model_version(self) -> str:
        if self.tier1.is_loaded:
            return self.tier1.model_version
        if self.tier2.is_loaded:
            return self.tier2.model_version
        return "stub-v1"

    @property
    def model(self):
        """Direct booster handle — used by app/explainability for SHAP."""
        return self.tier1.booster if self.tier1.is_loaded else None

    @property
    def model_type(self) -> str:
        if self.tier1.is_loaded:
            return self.tier1.model_type
        if self.tier2.is_loaded:
            return self.tier2.model_type
        return "none"

    # ----- Predict (legacy path; orchestrator is the preferred entrypoint) -
    def predict(self, features: np.ndarray) -> float:
        if self.tier1.is_loaded:
            return self.tier1.predict(features)
        if self.tier2.is_loaded:
            return self.tier2.predict(features)
        raise RuntimeError("No tier model loaded")
