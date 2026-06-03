"""Phase 4 — Optuna hyperparameter search for the candidate benchmark.

Gated by `tuning.enabled` in config/training.yaml (default false → the
benchmark uses the hand-tuned literals exactly as before). When enabled,
train.py calls `tune_candidate` for each candidate BEFORE the final
`candidates.train_candidate` run:

    1. Sample hyperparameters from a per-algorithm search space.
    2. Fit + isotonic-calibrate via `candidates.fit_calibrated` (the SAME code
       path the final artifact uses — the search optimizes the exact calibrated
       validation PR-AUC that gets reported, so there is no train/score drift).
    3. Maximize calibrated-val PR-AUC with a seeded TPE sampler.
    4. Return best hyperparameters merged over the YAML base params; train.py
       then trains the canonical bundle with them.

`optuna` is imported lazily inside `tune_candidate` so `python train.py` keeps
working with tuning OFF even if optuna isn't installed.
"""
from __future__ import annotations

import numpy as np
from sklearn.metrics import average_precision_score


# ─────────────────────────────────────────────────────────────────────────────
# Per-algorithm search spaces. Each returns ONLY the searched params; train.py
# merges them over the YAML base params (which keep n_estimators, early stopping,
# objective, random_state, class_weight, etc. fixed).
# ─────────────────────────────────────────────────────────────────────────────
def _suggest_xgboost(trial) -> dict:
    return {
        "learning_rate":    trial.suggest_float("learning_rate", 0.01, 0.1, log=True),
        "max_depth":        trial.suggest_int("max_depth", 3, 10),
        "subsample":        trial.suggest_float("subsample", 0.6, 1.0),
        "colsample_bytree": trial.suggest_float("colsample_bytree", 0.6, 1.0),
        "min_child_weight": trial.suggest_int("min_child_weight", 1, 50),
        "reg_alpha":        trial.suggest_float("reg_alpha", 1e-3, 10.0, log=True),
        "reg_lambda":       trial.suggest_float("reg_lambda", 1e-3, 10.0, log=True),
    }


def _suggest_lightgbm(trial) -> dict:
    return {
        "learning_rate":     trial.suggest_float("learning_rate", 0.01, 0.1, log=True),
        "num_leaves":        trial.suggest_int("num_leaves", 15, 255),
        "feature_fraction":  trial.suggest_float("feature_fraction", 0.6, 1.0),
        "bagging_fraction":  trial.suggest_float("bagging_fraction", 0.6, 1.0),
        "min_child_samples": trial.suggest_int("min_child_samples", 1, 50),
        "reg_alpha":         trial.suggest_float("reg_alpha", 1e-3, 10.0, log=True),
        "reg_lambda":        trial.suggest_float("reg_lambda", 1e-3, 10.0, log=True),
    }


def _suggest_catboost(trial) -> dict:
    return {
        "learning_rate":       trial.suggest_float("learning_rate", 0.01, 0.1, log=True),
        "depth":               trial.suggest_int("depth", 4, 10),
        "l2_leaf_reg":         trial.suggest_float("l2_leaf_reg", 1.0, 10.0, log=True),
        "bagging_temperature": trial.suggest_float("bagging_temperature", 0.0, 1.0),
    }


def _suggest_bagging(trial) -> dict:
    return {
        "n_estimators":      trial.suggest_int("n_estimators", 200, 800, step=50),
        "max_depth":         trial.suggest_int("max_depth", 10, 40),
        "min_samples_leaf":  trial.suggest_int("min_samples_leaf", 1, 20),
        "min_samples_split": trial.suggest_int("min_samples_split", 2, 30),
        "max_features":      trial.suggest_categorical("max_features", ["sqrt", "log2", 0.5]),
    }


_SUGGESTERS = {
    "xgboost":       _suggest_xgboost,
    "lightgbm":      _suggest_lightgbm,
    "catboost":      _suggest_catboost,
    "random_forest": _suggest_bagging,
    "extra_trees":   _suggest_bagging,
}

# Per-algorithm verbosity-silencing keys. The trainers in candidates.py honor
# these (verbose_eval / log_period / verbose) — injecting them keeps hundreds of
# search trials from drowning the console in per-boosting-round logs.
_QUIET = {
    "xgboost":       {"verbose_eval": 0},
    "lightgbm":      {"log_period": 0},
    "catboost":      {"verbose": 0},
    "random_forest": {},
    "extra_trees":   {},
}


def _stratified_subsample(X: np.ndarray, y, frac: float, seed: int):
    """Subsample rows preserving the fraud rate — used to keep slow bagging
    search trials affordable. The FINAL train_candidate always uses full train."""
    rng = np.random.default_rng(seed)
    y = np.asarray(y)
    idx_pos = np.where(y == 1)[0]
    idx_neg = np.where(y == 0)[0]
    n_pos = max(1, int(round(len(idx_pos) * frac)))
    n_neg = max(1, int(round(len(idx_neg) * frac)))
    sel = np.concatenate([
        rng.choice(idx_pos, size=min(n_pos, len(idx_pos)), replace=False),
        rng.choice(idx_neg, size=min(n_neg, len(idx_neg)), replace=False),
    ])
    rng.shuffle(sel)
    return X[sel], y[sel]


def tune_candidate(
    name: str,
    algorithm: str,
    X_train: np.ndarray,
    y_train,
    X_val: np.ndarray,
    y_val,
    *,
    n_trials: int,
    timeout: float | None,
    seed: int,
    base_hp: dict,
    search_subsample: float | None = None,
) -> tuple[dict, float, int]:
    """Run a TPE study maximizing calibrated-val PR-AUC. Returns
    (best_hyperparams_merged_over_base, best_val_pr_auc, n_trials_completed).

    Features are passed in pre-transformed — they are reused across every trial
    (do NOT re-run feature_pipeline.transform per trial).
    """
    import optuna

    optuna.logging.set_verbosity(optuna.logging.WARNING)

    if algorithm not in _SUGGESTERS:
        raise ValueError(f"No Optuna search space for algorithm '{algorithm}'")
    suggester = _SUGGESTERS[algorithm]
    quiet = _QUIET.get(algorithm, {})

    # Import here (not at module top) to avoid a circular import at load time.
    from candidates import fit_calibrated

    Xt, yt = X_train, y_train
    if search_subsample and 0.0 < float(search_subsample) < 1.0:
        Xt, yt = _stratified_subsample(X_train, y_train, float(search_subsample), seed)
        print(f"  [tune {name}] search on stratified subsample: "
              f"{len(yt)}/{len(y_train)} rows ({int(np.asarray(yt).sum())} fraud)")

    def objective(trial):
        hp = {**base_hp, **suggester(trial), **quiet}
        _model, _cal, cal_val = fit_calibrated(algorithm, hp, Xt, yt, X_val, y_val)
        return float(average_precision_score(y_val, cal_val))

    def _progress(study, trial):
        if trial.value is None:
            return
        print(f"  [tune {name}] trial {trial.number + 1}/{n_trials} "
              f"PR-AUC={trial.value:.4f} (best={study.best_value:.4f})")

    study = optuna.create_study(
        direction="maximize",
        sampler=optuna.samplers.TPESampler(seed=seed),
    )
    study.optimize(
        objective,
        n_trials=n_trials,
        timeout=timeout,
        callbacks=[_progress],
        show_progress_bar=False,
    )

    best_hp = {**base_hp, **study.best_params}
    return best_hp, float(study.best_value), len(study.trials)
