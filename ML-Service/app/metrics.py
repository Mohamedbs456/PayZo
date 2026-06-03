"""/metrics endpoint payload.

The Spring Boot analyst service expects {accuracy, precision, recall, f1,
aucRoc, aucPr, confusionMatrix, featureImportances, …}. We assemble that
shape from the newer per-tier metrics files when available, falling back
to a stub payload when no model has been trained yet.
"""
import json
from pathlib import Path

ARTIFACTS_DIR = Path("artifacts")
_TIER1_METRICS = ARTIFACTS_DIR / "tier1_metrics.json"
_TIER2_METRICS = ARTIFACTS_DIR / "tier2_metrics.json"
_LEGACY_METRICS = ARTIFACTS_DIR / "metrics.json"

_STUB_METRICS = {
    "accuracy": 0.0,
    "precision": 0.0,
    "recall": 0.0,
    "f1": 0.0,
    "aucRoc": 0.0,
    "aucPr": 0.0,
    "confusionMatrix": [[0, 0], [0, 0]],
    "featureImportances": {},
    "modelVersion": "stub-v1",
    "note": "Stub mode — train the model to see real metrics",
}


def load_metrics() -> dict:
    """Return metrics for the analyst /metrics endpoint.

    Preference: tier1 metrics file → legacy single-model file → stub.
    The tier2 file (when present) is folded into the payload under
    `tier2` so analysts can compare layers without an extra request.
    """
    if _TIER1_METRICS.exists():
        payload = json.loads(_TIER1_METRICS.read_text())
        if _TIER2_METRICS.exists():
            payload["tier2"] = json.loads(_TIER2_METRICS.read_text())
        return payload

    if _LEGACY_METRICS.exists():
        return json.loads(_LEGACY_METRICS.read_text())

    return dict(_STUB_METRICS)
