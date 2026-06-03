"""Phase 4 SHAP audit — per-feature attribution for canonical payloads.

For each scenario, prints the top-N features ranked by absolute SHAP
contribution. The jury narrative wants:

    1. The same (amount, hour) row decomposes very differently for STUDENT
       vs BUSINESS_OWNER per-user feature shapes.
    2. The per-user-norm features (`velocity_relative_to_user_norm`,
       `amount_z_score_user_30d`, `hour_likelihood_for_user`, etc.) dominate
       the attribution — not the old `is_known_beneficiary` or
       population-level velocity counts.

LightGBM / XGBoost / CatBoost all expose tree-based SHAP. CatBoost and
XGBoost return contributions natively; LightGBM uses the `shap` library's
TreeExplainer.

Usage (from ML-Service/ root):
    python -m scripts.shap_audit
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import joblib
import numpy as np

_ML_ROOT = Path(__file__).resolve().parent.parent
if str(_ML_ROOT) not in sys.path:
    sys.path.insert(0, str(_ML_ROOT))

from app.features import _request_to_row  # noqa: E402
from app.schemas import ScoreRequest      # noqa: E402
from feature_engineering import OUTPUT_FEATURE_NAMES  # noqa: E402

TIER1_MODEL = _ML_ROOT / "artifacts" / "tier1_model.pkl"
FIXTURES_DIR = _ML_ROOT / "scripts" / "jury_demo"


def _load_request(path: Path) -> ScoreRequest:
    payload = json.loads(path.read_text())
    return ScoreRequest(**payload)


def _features_row(req: ScoreRequest, pipeline) -> np.ndarray:
    row = _request_to_row(req)
    return pipeline.transform(row)


def _shap_for_tree(bundle: dict, features: np.ndarray) -> np.ndarray:
    """Return per-feature SHAP values shape (n_features,) for a single row."""
    algorithm = bundle["algorithm"]
    model = bundle["model"]

    if algorithm == "xgboost":
        import xgboost as xgb
        dmat = xgb.DMatrix(features, feature_names=list(OUTPUT_FEATURE_NAMES))
        contribs = model.predict(dmat, pred_contribs=True)
        return contribs[0, :-1]  # last col is bias

    if algorithm == "lightgbm":
        # LightGBM has native pred_contrib support.
        contribs = model.predict(features, pred_contrib=True)
        return np.asarray(contribs[0, :-1])

    if algorithm == "catboost":
        contribs = model.get_feature_importance(
            data=None, type="ShapValues",
            prettified=False,
        )
        # Fallback path — for a single point use predict shap_values via the
        # catboost API differently. Skip if not directly callable.
        try:
            from catboost import Pool
            pool = Pool(features)
            sv = model.get_feature_importance(pool, type="ShapValues")
            return np.asarray(sv[0, :-1])
        except Exception:
            return np.zeros(len(OUTPUT_FEATURE_NAMES))

    # Sklearn ensembles → use shap.TreeExplainer if available.
    try:
        import shap
        explainer = shap.TreeExplainer(model)
        sv = explainer.shap_values(features)
        if isinstance(sv, list):
            sv = sv[1]  # class-1 contributions
        return np.asarray(sv[0])
    except Exception:
        return np.zeros(len(OUTPUT_FEATURE_NAMES))


def _format_attribution(shap_vals: np.ndarray, top_n: int = 10) -> str:
    pairs = list(zip(OUTPUT_FEATURE_NAMES, shap_vals))
    pairs.sort(key=lambda kv: abs(kv[1]), reverse=True)
    lines = []
    for name, val in pairs[:top_n]:
        sign = "+" if val >= 0 else ""
        bar_len = int(min(abs(val) * 30, 40))
        bar = ("█" if val >= 0 else "░") * bar_len
        lines.append(f"  {name:<34} {sign}{val:.4f}  {bar}")
    return "\n".join(lines)


def main() -> None:
    if not TIER1_MODEL.exists():
        sys.exit(f"Tier 1 artifact missing at {TIER1_MODEL}. Run `python train.py` first.")
    bundle = joblib.load(TIER1_MODEL)
    pipeline = bundle["feature_pipeline"]
    algorithm = bundle["algorithm"]
    print(f"loaded Tier 1: {bundle['model_version']} ({algorithm})")

    scenarios = {
        "STUDENT @ 5K TND @ 3am (jury fraud)":   FIXTURES_DIR / "student_5k_3am.json",
        "BUSINESS_OWNER @ 5K TND @ 3am (legit)": FIXTURES_DIR / "business_5k_3am.json",
        "NIGHT_WORKER @ 8K TND @ 2pm (fraud)":   FIXTURES_DIR / "night_worker_2pm_fraud.json",
        "NIGHT_WORKER @ 400 TND @ 3am (legit)":  FIXTURES_DIR / "night_worker_3am_legit.json",
        "BUSINESS_OWNER 100tx/24h (legit)":      FIXTURES_DIR / "coffee_shop_high_velocity_legit.json",
    }

    for label, path in scenarios.items():
        if not path.exists():
            print(f"\n[skip] {label} — fixture missing at {path}")
            continue
        req = _load_request(path)
        feats = _features_row(req, pipeline)
        shap_vals = _shap_for_tree(bundle, feats)

        # Final calibrated score for context.
        from candidates import TierLoader
        loader = TierLoader(TIER1_MODEL, _ML_ROOT / "artifacts" / "tier1_metrics.json").load()
        proba = loader.predict(feats)

        print(f"\n=== {label} ===")
        print(f"  risk_score = {proba:.4f}  "
              f"({'BLOCK' if proba >= 0.70 else ('REVIEW' if proba >= 0.30 else 'ALLOW')})")
        print("  top-10 feature contributions (signed; + → pushes toward FRAUD):")
        print(_format_attribution(shap_vals, top_n=10))


if __name__ == "__main__":
    main()
