"""SHAP attribution for analyst-facing explanations.

For Tier 1 (XGBoost) we use TreeSHAP via the booster's native `pred_contribs=True`
mode — fast, exact, no shap dependency required at runtime. For Tier 2 (sklearn
linear/tree models) we fall back to either the SHAP library's TreeExplainer or
to global feature_importances_ / coefficient magnitudes.
"""
import numpy as np
import xgboost as xgb

from feature_engineering import OUTPUT_FEATURE_NAMES

# Old export name preserved for compatibility with callers that import it
# from this module rather than from feature_engineering.
FEATURE_NAMES = list(OUTPUT_FEATURE_NAMES)

try:
    import shap
    _SHAP_AVAILABLE = True
except ImportError:
    _SHAP_AVAILABLE = False


def compute_shap_values(
    model, features: np.ndarray, model_type: str
) -> dict[str, float]:
    """Per-feature SHAP contributions for the prediction at `features[0]`.

    Args:
        model: an xgboost.Booster (model_type='xgboost') or sklearn estimator.
        features: shape (1, n_features) — typically the output of build_feature_vector.
        model_type: 'xgboost' or 'sklearn'.
    """
    if model is None:
        return {}

    if model_type == "xgboost":
        dmatrix = xgb.DMatrix(features, feature_names=FEATURE_NAMES)
        contribs = model.predict(dmatrix, pred_contribs=True)
        shap_vals = contribs[0, :-1]
        return {
            name: round(float(val), 6)
            for name, val in zip(FEATURE_NAMES, shap_vals)
        }

    if _SHAP_AVAILABLE and hasattr(model, "estimators_"):
        try:
            explainer = shap.TreeExplainer(model)
            shap_vals = explainer.shap_values(features)
            if isinstance(shap_vals, list):
                shap_vals = shap_vals[1]
            return {
                name: round(float(shap_vals[0, i]), 6)
                for i, name in enumerate(FEATURE_NAMES)
            }
        except Exception:
            pass

    if hasattr(model, "feature_importances_"):
        imp = model.feature_importances_
        total = imp.sum() or 1.0
        return {
            f"[global_importance] {name}": round(float(imp[i] / total), 6)
            for i, name in enumerate(FEATURE_NAMES)
        }

    if hasattr(model, "coef_"):
        coef = np.atleast_2d(model.coef_)[0]
        return {
            f"[coefficient] {name}": round(float(coef[i]), 6)
            for i, name in enumerate(FEATURE_NAMES[: len(coef)])
        }

    return {}
