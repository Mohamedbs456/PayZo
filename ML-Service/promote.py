"""Phase 4.D — promote the top candidates to Tier 1 and Tier 2.

Rule:
    Tier 1 = highest PR-AUC among GBM-family candidates  (gradient boosting)
    Tier 2 = highest PR-AUC among bagging-family candidates  (RF / ET)

The diversity story for the jury: Tier 1 captures residual-fitting signal
(low-bias), Tier 2 captures bootstrap/bagging signal (low-variance). Each tier
sees the same feature vector but learns it from different angles.

The promoted bundles are copied to canonical paths:
    artifacts/tier1_model.pkl
    artifacts/tier1_metrics.json
    artifacts/tier2_model.pkl
    artifacts/tier2_metrics.json
    artifacts/feature_pipeline.pkl    (from Tier 1's bundle — both tiers share it)
    artifacts/benchmark_report.json   (all 5 candidates side-by-side)
"""
from __future__ import annotations

import json
import shutil
from pathlib import Path

import joblib

from candidates import CandidateResult

ARTIFACTS_DIR = Path("artifacts")
TIER1_MODEL_PATH = ARTIFACTS_DIR / "tier1_model.pkl"
TIER1_METRICS_PATH = ARTIFACTS_DIR / "tier1_metrics.json"
TIER2_MODEL_PATH = ARTIFACTS_DIR / "tier2_model.pkl"
TIER2_METRICS_PATH = ARTIFACTS_DIR / "tier2_metrics.json"
FEATURE_PIPELINE_PATH = ARTIFACTS_DIR / "feature_pipeline.pkl"
BENCHMARK_REPORT_PATH = ARTIFACTS_DIR / "benchmark_report.json"


def promote_top_two(results: list[CandidateResult]) -> tuple[CandidateResult, CandidateResult]:
    """Pick top GBM as Tier 1, top bagging model as Tier 2. Copy artifacts."""
    gbm = [r for r in results if r.family == "gbm"]
    bagging = [r for r in results if r.family == "bagging"]
    if not gbm:
        raise ValueError("No GBM candidates available for Tier 1 promotion")
    if not bagging:
        raise ValueError("No bagging candidates available for Tier 2 promotion")

    tier1 = max(gbm, key=lambda r: r.pr_auc)
    tier2 = max(bagging, key=lambda r: r.pr_auc)

    print(f"\n[promote] Tier 1 ← {tier1.name} (PR-AUC={tier1.pr_auc:.4f}, family=gbm)")
    print(f"[promote] Tier 2 ← {tier2.name} (PR-AUC={tier2.pr_auc:.4f}, family=bagging)")

    # Re-version the promoted artifacts to clarify their role.
    _promote_artifact(tier1, TIER1_MODEL_PATH, TIER1_METRICS_PATH, role="tier1")
    _promote_artifact(tier2, TIER2_MODEL_PATH, TIER2_METRICS_PATH, role="tier2")

    # Feature pipeline is shared — extract from Tier 1's bundle. (Tier 2's pipeline
    # is identical since `train_candidate` reuses the passed-in pipeline.)
    bundle = joblib.load(TIER1_MODEL_PATH)
    joblib.dump(bundle["feature_pipeline"], FEATURE_PIPELINE_PATH)
    print(f"[promote] feature_pipeline.pkl ← {tier1.name}")

    # Side-by-side benchmark report — all 5 candidates with key metrics.
    report = {
        "tier1": {"name": tier1.name, "algorithm": tier1.algorithm,
                  "pr_auc": tier1.pr_auc, "model_version": tier1.model_version},
        "tier2": {"name": tier2.name, "algorithm": tier2.algorithm,
                  "pr_auc": tier2.pr_auc, "model_version": tier2.model_version},
        "candidates": [
            {
                "name": r.name,
                "algorithm": r.algorithm,
                "family": r.family,
                "pr_auc": r.pr_auc,
                "roc_auc": r.roc_auc,
                "precision": r.precision,
                "recall": r.recall,
                "f1": r.f1,
                "precision_at_top1pct": r.precision_at_top1pct,
                "recall_at_top1pct": r.recall_at_top1pct,
                "optimal_threshold": r.optimal_threshold,
                "train_seconds": r.train_seconds,
                "promoted_as": (
                    "tier1" if r.name == tier1.name
                    else ("tier2" if r.name == tier2.name else None)
                ),
            }
            for r in sorted(results, key=lambda r: r.pr_auc, reverse=True)
        ],
    }
    BENCHMARK_REPORT_PATH.write_text(json.dumps(report, indent=2))
    print(f"[promote] benchmark_report.json written")

    return tier1, tier2


def _promote_artifact(
    candidate: CandidateResult,
    canonical_model_path: Path,
    canonical_metrics_path: Path,
    *,
    role: str,
) -> None:
    """Copy a candidate bundle to its canonical Tier path, restamping the
    model_version to include the tier role for downstream display."""
    if candidate.artifact_path is None:
        raise ValueError(f"Candidate {candidate.name} has no artifact_path")
    bundle = joblib.load(candidate.artifact_path)
    # Rename modelVersion to mark it as the active tier (e.g. payzo-tier1-xgboost-v5)
    tier_version = f"payzo-{role}-{candidate.algorithm}-v5"
    bundle["model_version"] = tier_version
    bundle["role"] = role
    joblib.dump(bundle, canonical_model_path)

    if candidate.metrics_path and candidate.metrics_path.exists():
        metrics = json.loads(candidate.metrics_path.read_text())
        metrics["modelVersion"] = tier_version
        metrics["role"] = role
        canonical_metrics_path.write_text(json.dumps(metrics, indent=2))
