"""Phase 4.D — multi-algorithm candidate trainer.

Trains a single algorithm (XGBoost / LightGBM / CatBoost / RandomForest /
ExtraTrees) under a uniform pipeline:

    1. Build (or reuse) the feature pipeline from feature_engineering.
    2. Fit the model on train; XGBoost / LightGBM / CatBoost use early stopping
       against val. RandomForest / ExtraTrees just fit on full train.
    3. Get raw probas on val.
    4. Fit a 1-D isotonic calibrator on (raw_val_proba, y_val).
    5. Compute calibrated metrics on val.
    6. Save a joblib bundle to artifacts/candidates/{name}.pkl.

`promote.promote_top_two(results)` then copies the winning Tier 1 (best GBM)
and Tier 2 (best bagging model) bundles to canonical paths. The Tier1Loader
and Tier2Loader in this file know how to read those bundles back regardless
of which algorithm won.

Why isotonic on every candidate (and not Tier 2's old sigmoid-via-CalibratedClassifierCV):
- Uniform pipeline makes the benchmark apples-to-apples.
- Tree-based candidates produce reasonably calibrated probabilities post-isotonic;
  the v4 sigmoid+CV2 trick was an XGBoost-vs-RF disparity workaround that the
  new feature vector doesn't need.
"""
from __future__ import annotations

import json
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import ExtraTreesClassifier, RandomForestClassifier
from sklearn.isotonic import IsotonicRegression
from sklearn.metrics import (
    average_precision_score,
    confusion_matrix,
    f1_score,
    precision_recall_curve,
    precision_score,
    recall_score,
    roc_auc_score,
)

from feature_engineering import OUTPUT_FEATURE_NAMES, build_pipeline

ARTIFACTS_DIR = Path("artifacts")
CANDIDATES_DIR = ARTIFACTS_DIR / "candidates"
DATASET_VERSION = "v5"

ALGO_FAMILY: dict[str, str] = {
    "xgboost":       "gbm",
    "lightgbm":      "gbm",
    "catboost":      "gbm",
    "random_forest": "bagging",
    "extra_trees":   "bagging",
}


@dataclass
class CandidateResult:
    name: str                           # human-readable candidate name (e.g., "xgboost")
    algorithm: str                      # one of ALGO_FAMILY keys
    family: str                         # 'gbm' | 'bagging'
    model_version: str                  # e.g., 'payzo-xgboost-v5'
    pr_auc: float
    roc_auc: float
    precision: float
    recall: float
    f1: float
    precision_at_top1pct: float
    recall_at_top1pct: float
    optimal_threshold: float
    feature_importances: dict[str, float] = field(default_factory=dict)
    train_seconds: float = 0.0
    artifact_path: Path | None = None   # path to the joblib bundle
    metrics_path: Path | None = None    # path to the metrics JSON


# ─────────────────────────────────────────────────────────────────────────────
# Per-algorithm training adapters. Each returns a (model, raw_val_proba) pair.
# ─────────────────────────────────────────────────────────────────────────────
def _train_xgboost(hp: dict, X_train, y_train, X_val, y_val):
    import xgboost as xgb
    params = dict(hp)
    n_estimators = params.pop("n_estimators", 2000)
    early_stopping_rounds = params.pop("early_stopping_rounds", 50)
    verbose_eval = params.pop("verbose_eval", 200) or False
    params.setdefault("eta", params.pop("learning_rate", 0.03))
    pos_weight = float((y_train == 0).sum() / max((y_train == 1).sum(), 1))
    params["scale_pos_weight"] = pos_weight

    dtrain = xgb.DMatrix(X_train, label=y_train, feature_names=OUTPUT_FEATURE_NAMES)
    dval = xgb.DMatrix(X_val, label=y_val, feature_names=OUTPUT_FEATURE_NAMES)
    booster = xgb.train(
        params=params,
        dtrain=dtrain,
        num_boost_round=n_estimators,
        evals=[(dtrain, "train"), (dval, "val")],
        early_stopping_rounds=early_stopping_rounds,
        verbose_eval=verbose_eval,
    )
    raw_val = np.asarray(booster.predict(dval), dtype=np.float64)
    return booster, raw_val


def _train_lightgbm(hp: dict, X_train, y_train, X_val, y_val):
    import lightgbm as lgb
    params = dict(hp)
    n_estimators = params.pop("n_estimators", 2000)
    early_stopping_rounds = params.pop("early_stopping_rounds", 50)
    log_period = params.pop("log_period", 200)
    pos_weight = float((y_train == 0).sum() / max((y_train == 1).sum(), 1))
    params["scale_pos_weight"] = pos_weight
    params.setdefault("objective", "binary")
    params.setdefault("metric", "average_precision")
    params.setdefault("verbosity", -1)

    train_set = lgb.Dataset(X_train, label=y_train, feature_name=OUTPUT_FEATURE_NAMES)
    val_set = lgb.Dataset(X_val, label=y_val, feature_name=OUTPUT_FEATURE_NAMES,
                          reference=train_set)
    callbacks = [lgb.early_stopping(early_stopping_rounds, verbose=False)]
    if log_period:
        callbacks.append(lgb.log_evaluation(period=log_period))
    booster = lgb.train(
        params=params,
        train_set=train_set,
        num_boost_round=n_estimators,
        valid_sets=[val_set],
        callbacks=callbacks,
    )
    raw_val = np.asarray(booster.predict(X_val), dtype=np.float64)
    return booster, raw_val


def _train_catboost(hp: dict, X_train, y_train, X_val, y_val):
    import catboost as cb
    params = dict(hp)
    iterations = params.pop("iterations", 2000)
    early_stopping_rounds = params.pop("early_stopping_rounds", 50)
    pos_weight = float((y_train == 0).sum() / max((y_train == 1).sum(), 1))
    params.setdefault("loss_function", "Logloss")
    params.setdefault("eval_metric", "PRAUC")
    params.setdefault("scale_pos_weight", pos_weight)
    params.setdefault("verbose", 200)

    model = cb.CatBoostClassifier(iterations=iterations, **params)
    model.fit(
        X_train, y_train,
        eval_set=(X_val, y_val),
        early_stopping_rounds=early_stopping_rounds,
        use_best_model=True,
    )
    raw_val = np.asarray(model.predict_proba(X_val)[:, 1], dtype=np.float64)
    return model, raw_val


def _train_random_forest(hp: dict, X_train, y_train, X_val, y_val):
    params = dict(hp)
    params.setdefault("n_jobs", -1)
    model = RandomForestClassifier(**params)
    model.fit(X_train, y_train)
    raw_val = np.asarray(model.predict_proba(X_val)[:, 1], dtype=np.float64)
    return model, raw_val


def _train_extra_trees(hp: dict, X_train, y_train, X_val, y_val):
    params = dict(hp)
    params.setdefault("n_jobs", -1)
    model = ExtraTreesClassifier(**params)
    model.fit(X_train, y_train)
    raw_val = np.asarray(model.predict_proba(X_val)[:, 1], dtype=np.float64)
    return model, raw_val


_TRAINERS = {
    "xgboost":       _train_xgboost,
    "lightgbm":      _train_lightgbm,
    "catboost":      _train_catboost,
    "random_forest": _train_random_forest,
    "extra_trees":   _train_extra_trees,
}


def fit_calibrated(algorithm: str, hp: dict, X_train, y_train, X_val, y_val):
    """Train one algorithm and fit a 1-D isotonic calibrator on val.

    Returns (model, calibrator, cal_val_proba). Shared by `train_candidate`
    (final artifact) and `tuning.tune_candidate` (Optuna search objective) so
    the PR-AUC optimized during the search is the *exact* calibrated metric the
    final artifact reports — no train/score drift between the two paths.
    """
    if algorithm not in _TRAINERS:
        raise ValueError(f"Unknown algorithm '{algorithm}'")
    model, raw_val = _TRAINERS[algorithm](hp, X_train, y_train, X_val, y_val)
    calibrator = IsotonicRegression(out_of_bounds="clip", y_min=0.0, y_max=1.0)
    calibrator.fit(raw_val, y_val)
    cal_val = np.clip(calibrator.predict(raw_val), 0.0, 1.0)
    return model, calibrator, cal_val


# ─────────────────────────────────────────────────────────────────────────────
# Inference adapters — used by the unified loader.
# ─────────────────────────────────────────────────────────────────────────────
def _predict_xgboost(model, features: np.ndarray) -> float:
    import xgboost as xgb
    dmatrix = xgb.DMatrix(features, feature_names=OUTPUT_FEATURE_NAMES)
    return float(model.predict(dmatrix)[0])


def _predict_lightgbm(model, features: np.ndarray) -> float:
    return float(model.predict(features)[0])


def _predict_catboost(model, features: np.ndarray) -> float:
    return float(model.predict_proba(features)[0, 1])


def _predict_sklearn(model, features: np.ndarray) -> float:
    return float(model.predict_proba(features)[0, 1])


_PREDICTORS = {
    "xgboost":       _predict_xgboost,
    "lightgbm":      _predict_lightgbm,
    "catboost":      _predict_catboost,
    "random_forest": _predict_sklearn,
    "extra_trees":   _predict_sklearn,
}


def _raw_proba_batch(algorithm: str, model, X: np.ndarray) -> np.ndarray:
    """Vectorized raw (uncalibrated) fraud probability over a batch of rows.
    Mirrors the single-row _PREDICTORS but for whole-array test-set scoring."""
    if algorithm == "xgboost":
        import xgboost as xgb
        dmatrix = xgb.DMatrix(X, feature_names=OUTPUT_FEATURE_NAMES)
        return np.asarray(model.predict(dmatrix), dtype=np.float64)
    if algorithm == "lightgbm":
        return np.asarray(model.predict(X), dtype=np.float64)
    return np.asarray(model.predict_proba(X)[:, 1], dtype=np.float64)


def predict_calibrated_batch(bundle: dict, X: np.ndarray) -> np.ndarray:
    """Calibrated fraud probabilities for a batch, using a saved tier bundle.
    Used by train.py to score the held-out test split for the honesty report."""
    raw = _raw_proba_batch(bundle["algorithm"], bundle["model"], X)
    return np.clip(bundle["calibrator"].predict(raw), 0.0, 1.0)


def _feature_importances(algorithm: str, model) -> dict[str, float]:
    """Normalized {feature: importance} dict — same key set across all algos."""
    try:
        if algorithm == "xgboost":
            score = model.get_score(importance_type="gain")
            total = sum(score.values()) or 1.0
            return {
                name: round(score.get(name, 0.0) / total, 6)
                for name in OUTPUT_FEATURE_NAMES
            }
        elif algorithm == "lightgbm":
            importances = model.feature_importance(importance_type="gain")
            total = importances.sum() or 1.0
            return {
                name: round(float(importances[i] / total), 6)
                for i, name in enumerate(OUTPUT_FEATURE_NAMES)
            }
        elif algorithm == "catboost":
            importances = model.get_feature_importance()
            total = importances.sum() or 1.0
            return {
                name: round(float(importances[i] / total), 6)
                for i, name in enumerate(OUTPUT_FEATURE_NAMES)
            }
        else:  # sklearn ensembles
            importances = getattr(model, "feature_importances_", None)
            if importances is None:
                return {}
            total = importances.sum() or 1.0
            return {
                name: round(float(importances[i] / total), 6)
                for i, name in enumerate(OUTPUT_FEATURE_NAMES)
            }
    except Exception:
        return {}


# ─────────────────────────────────────────────────────────────────────────────
# Metrics helper — shared with the legacy tier1_main_model._compute_metrics shape
# so existing JSON readers (analyst dashboard, etc.) still work.
# ─────────────────────────────────────────────────────────────────────────────
def _compute_metrics(y_true: np.ndarray, y_proba: np.ndarray) -> dict:
    """Compute calibrated-probability metrics at the operating threshold.

    Threshold-picking strategy:
      1. If some threshold satisfies BOTH precision ≥ 0.80 and recall ≥ 0.80,
         pick the one with highest F1 among those (the "balanced operating
         point" the v5 sanity gates target).
      2. Otherwise fall back to the global F1-max threshold.

    This makes the reported `precision` / `recall` reflect a realistic deploy
    threshold rather than an aggressive minority threshold that maxes F1 by
    sacrificing one axis.
    """
    y_true = np.asarray(y_true).reshape(-1)
    y_proba = np.asarray(y_proba).reshape(-1)
    if y_true.sum() == 0:
        return {
            "aucPr": 0.0, "aucRoc": 0.0, "f1": 0.0,
            "precision": 0.0, "recall": 0.0,
            "confusionMatrix": [[len(y_true), 0], [0, 0]],
            "optimalThreshold": 0.5,
            "precisionAtTop1pct": 0.0, "recallAtTop1pct": 0.0,
        }

    pr_auc = float(average_precision_score(y_true, y_proba))
    roc_auc = float(roc_auc_score(y_true, y_proba))

    precisions, recalls, thresholds = precision_recall_curve(y_true, y_proba)
    # precisions / recalls have len = n_thresholds + 1 (last point is P=1, R=0).
    n_thr = len(thresholds)
    f1s = 2 * precisions[:n_thr] * recalls[:n_thr] / (precisions[:n_thr] + recalls[:n_thr] + 1e-9)

    # Step 1 — try the balanced operating point.
    balanced_candidates = [
        i for i in range(n_thr)
        if precisions[i] >= 0.80 and recalls[i] >= 0.80
    ]
    if balanced_candidates:
        best_idx = max(balanced_candidates, key=lambda i: f1s[i])
    else:
        best_idx = int(np.argmax(f1s)) if n_thr > 0 else 0
    optimal_threshold = float(thresholds[best_idx]) if n_thr > 0 else 0.5

    y_pred = (y_proba >= optimal_threshold).astype(int)
    cm = confusion_matrix(y_true, y_pred).tolist()

    k = max(1, int(len(y_proba) * 0.01))
    top_idx = np.argsort(y_proba)[-k:]
    tp_at_k = y_true[top_idx].sum()
    precision_at_k = tp_at_k / k
    recall_at_k = tp_at_k / max(y_true.sum(), 1)

    return {
        "aucPr": round(pr_auc, 6),
        "aucRoc": round(roc_auc, 6),
        "f1": round(float(f1_score(y_true, y_pred, zero_division=0)), 6),
        "precision": round(float(precision_score(y_true, y_pred, zero_division=0)), 6),
        "recall": round(float(recall_score(y_true, y_pred, zero_division=0)), 6),
        "confusionMatrix": cm,
        "optimalThreshold": round(optimal_threshold, 4),
        "precisionAtTop1pct": round(float(precision_at_k), 6),
        "recallAtTop1pct": round(float(recall_at_k), 6),
    }


# ─────────────────────────────────────────────────────────────────────────────
# Training entrypoint
# ─────────────────────────────────────────────────────────────────────────────
def train_candidate(
    name: str,
    cfg: dict,
    train_df: pd.DataFrame,
    val_df: pd.DataFrame,
    feature_pipeline=None,
) -> CandidateResult:
    """Train one candidate, calibrate on val, write artifacts, return result."""
    algorithm = cfg["algorithm"]
    if algorithm not in _TRAINERS:
        raise ValueError(f"Unknown algorithm '{algorithm}' for candidate '{name}'")
    family = ALGO_FAMILY[algorithm]
    hyperparams = dict(cfg.get("hyperparams", {}))
    model_version = f"payzo-{name}-{DATASET_VERSION}"

    print(f"\n[candidate {name}] algorithm={algorithm} family={family}")

    # ---- 1. Feature pipeline -----------------------------------------------
    if feature_pipeline is None:
        feature_pipeline = build_pipeline(scale_numeric=False)
        feature_pipeline.fit(train_df)
    X_train = feature_pipeline.transform(train_df)
    y_train = train_df["is_fraud"].to_numpy().astype(np.int8)
    X_val = feature_pipeline.transform(val_df)
    y_val = val_df["is_fraud"].to_numpy().astype(np.int8)

    print(f"[candidate {name}] train={len(y_train)} val={len(y_val)} "
          f"fraud_val={int(y_val.sum())}")

    # ---- 2+3. Train + isotonic calibration (shared with tuning.py) ---------
    start = time.monotonic()
    model, calibrator, cal_val = fit_calibrated(
        algorithm, hyperparams, X_train, y_train, X_val, y_val
    )
    train_seconds = time.monotonic() - start
    print(f"[candidate {name}] trained in {train_seconds:.1f}s")

    # ---- 4. Metrics --------------------------------------------------------
    metrics = _compute_metrics(y_val, cal_val)
    feature_importances = _feature_importances(algorithm, model)
    metrics.update({
        "modelVersion":       model_version,
        "modelType":          algorithm,
        "family":             family,
        "trainedAt":          datetime.now(timezone.utc).isoformat(),
        "dataset":            f"payzo-synthetic-{DATASET_VERSION}",
        "nTrain":             int(len(y_train)),
        "nVal":               int(len(y_val)),
        "nFraudTrain":        int(y_train.sum()),
        "nFraudVal":          int(y_val.sum()),
        "trainSeconds":       round(float(train_seconds), 2),
        "calibrationMethod":  "isotonic",
        "featureImportances": feature_importances,
    })

    # ---- 5. Persist --------------------------------------------------------
    CANDIDATES_DIR.mkdir(parents=True, exist_ok=True)
    artifact_path = CANDIDATES_DIR / f"{name}.pkl"
    metrics_path = CANDIDATES_DIR / f"{name}_metrics.json"

    bundle = {
        "algorithm":        algorithm,
        "family":           family,
        "model":            model,
        "calibrator":       calibrator,
        "calibration_method": "isotonic",
        "feature_pipeline": feature_pipeline,
        "feature_names":    list(OUTPUT_FEATURE_NAMES),
        "model_version":    model_version,
    }
    joblib.dump(bundle, artifact_path)
    metrics_path.write_text(json.dumps(metrics, indent=2))

    print(f"[candidate {name}] PR-AUC={metrics['aucPr']:.4f} "
          f"ROC-AUC={metrics['aucRoc']:.4f} "
          f"P={metrics['precision']:.3f} R={metrics['recall']:.3f}")

    return CandidateResult(
        name=name,
        algorithm=algorithm,
        family=family,
        model_version=model_version,
        pr_auc=float(metrics["aucPr"]),
        roc_auc=float(metrics["aucRoc"]),
        precision=float(metrics["precision"]),
        recall=float(metrics["recall"]),
        f1=float(metrics["f1"]),
        precision_at_top1pct=float(metrics["precisionAtTop1pct"]),
        recall_at_top1pct=float(metrics["recallAtTop1pct"]),
        optimal_threshold=float(metrics["optimalThreshold"]),
        feature_importances=feature_importances,
        train_seconds=float(train_seconds),
        artifact_path=artifact_path,
        metrics_path=metrics_path,
    )


# ─────────────────────────────────────────────────────────────────────────────
# Unified inference loader — same class loads any-algorithm tier from joblib.
# ─────────────────────────────────────────────────────────────────────────────
class TierLoader:
    """Loads a Tier (1 or 2) joblib bundle saved by `train_candidate` and
    dispatches `predict()` by the bundle's algorithm field."""

    def __init__(self, artifact_path: Path, metrics_path: Path | None = None):
        self.artifact_path = Path(artifact_path)
        self.metrics_path = Path(metrics_path) if metrics_path else None
        self.bundle: dict[str, Any] | None = None
        self.algorithm: str = "unknown"
        self.calibration_method: str = "isotonic"
        self.model_version: str = "unloaded"
        self.is_loaded: bool = False

    def load(self) -> "TierLoader":
        if not self.artifact_path.exists():
            return self
        self.bundle = joblib.load(self.artifact_path)
        self.algorithm = self.bundle.get("algorithm", "unknown")
        self.calibration_method = self.bundle.get("calibration_method", "isotonic")
        self.model_version = self.bundle.get("model_version", "unknown")
        if self.metrics_path and self.metrics_path.exists():
            try:
                meta = json.loads(self.metrics_path.read_text())
                self.model_version = meta.get("modelVersion", self.model_version)
            except Exception:
                pass
        self.is_loaded = True
        return self

    def predict(self, features: np.ndarray) -> float:
        if not self.is_loaded or self.bundle is None:
            raise RuntimeError(f"Tier model at {self.artifact_path} not loaded")
        model = self.bundle["model"]
        calibrator = self.bundle["calibrator"]
        predictor = _PREDICTORS.get(self.algorithm)
        if predictor is None:
            raise RuntimeError(f"No predictor registered for algorithm '{self.algorithm}'")
        raw = predictor(model, features)
        cal = float(np.clip(calibrator.predict(np.asarray([raw], dtype=np.float64))[0], 0.0, 1.0))
        return cal

    # ─ Back-compat surface — app/model.py + app/main.py read these for SHAP ─
    @property
    def booster(self):
        """Return the underlying raw model (any algorithm). Named for the
        historical XGBoost Tier 1 — kept so app/model.py.model() keeps
        working without changes."""
        if not self.is_loaded or self.bundle is None:
            return None
        return self.bundle["model"]

    @property
    def model_type(self) -> str:
        """SHAP path discriminator. xgboost → TreeSHAP via booster, others →
        shap.TreeExplainer (LightGBM/CatBoost) or feature_importances_ fallback."""
        if self.algorithm == "xgboost":
            return "xgboost"
        if self.algorithm == "lightgbm":
            return "lightgbm"
        if self.algorithm == "catboost":
            return "catboost"
        return "sklearn"
