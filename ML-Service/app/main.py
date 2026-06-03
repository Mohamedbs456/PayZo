"""FastAPI app for the PayZo ML inference service.

Endpoints under /ml/api/v1:
    POST /score             primary scoring — Tier 1 → Tier 2 → Tier 3 → Stub
    POST /score/backup      forces start at Tier 2 (matches Java D35 layer 2 contract)
    GET  /health            status + active model + thresholds
    GET  /metrics           analyst-facing metrics payload
    POST /admin/thresholds  SuperAdmin threshold updates (D38)

Routing through the Orchestrator means a single dispatch policy lives in one
place; this module is intentionally thin.
"""
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.explainability import compute_shap_values
from app.features import build_feature_vector
from app.metrics import load_metrics
from app.schemas import ScoreRequest, ScoreResponse, ThresholdUpdate
from orchestrator import build_orchestrator

orchestrator = None  # populated in lifespan


@asynccontextmanager
async def lifespan(app: FastAPI):
    global orchestrator
    orchestrator = build_orchestrator()
    print(
        f"ML Service started — "
        f"tier1_loaded={orchestrator.tier1.is_loaded} "
        f"tier2_loaded={orchestrator.tier2.is_loaded} "
        f"tier3_rules={len(orchestrator.tier3.rules)} "
        f"version_tier1={orchestrator.tier1.model_version}"
    )
    yield


app = FastAPI(
    title="PayZo ML Service",
    version="3.0.0",
    lifespan=lifespan,
)


def _shap_for_tier1(req: ScoreRequest):
    """Return SHAP attributions if Tier 1 booster is loaded; else None."""
    if orchestrator is None or not orchestrator.tier1.is_loaded:
        return None
    try:
        features = build_feature_vector(req)
        return compute_shap_values(orchestrator.tier1.booster, features, orchestrator.tier1.model_type)
    except Exception:
        return None


def _to_response(req: ScoreRequest, decision) -> ScoreResponse:
    return ScoreResponse(
        transactionId=decision.transactionId,
        riskScore=decision.riskScore,
        riskLevel=decision.riskLevel,
        modelVersion=decision.modelVersion,
        latencyMs=decision.latencyMs,
        shapValues=_shap_for_tier1(req),
        reasons=decision.reasons,
        tier=decision.tier,
        decision=decision.decision,
        ruleFired=decision.ruleFired or None,
    )


@app.get("/ml/api/v1/health")
def health():
    if orchestrator is None:
        return {"status": "STARTING"}
    return {
        "status": "UP",
        "tier1": {
            "loaded": orchestrator.tier1.is_loaded,
            "modelVersion": orchestrator.tier1.model_version,
        },
        "tier2": {
            "loaded": orchestrator.tier2.is_loaded,
            "modelVersion": orchestrator.tier2.model_version,
        },
        "tier3": {
            "rules": len(orchestrator.tier3.rules),
        },
        "thresholds": {
            "low_max": orchestrator.threshold_mgr.low_max,
            "medium_max": orchestrator.threshold_mgr.medium_max,
        },
    }


@app.post("/ml/api/v1/score", response_model=ScoreResponse)
def score(req: ScoreRequest):
    decision = orchestrator.score(req)
    return _to_response(req, decision)


@app.post("/ml/api/v1/score/backup", response_model=ScoreResponse)
def score_backup(req: ScoreRequest):
    """D35 layer 2 — Java side calls this when Tier 1 is unavailable."""
    decision = orchestrator.score_skip_tier1(req)
    return _to_response(req, decision)


@app.get("/ml/api/v1/metrics")
def metrics():
    return load_metrics()


@app.post("/ml/api/v1/admin/thresholds")
def update_thresholds(body: ThresholdUpdate):
    if orchestrator is None:
        return {"status": "starting"}
    orchestrator.threshold_mgr.update(body.thresholdLowMedium, body.thresholdMediumHigh)
    # Keep orchestrator's local cache aligned with the persisted thresholds.
    orchestrator.allow_max = orchestrator.threshold_mgr.low_max
    orchestrator.block_min = orchestrator.threshold_mgr.medium_max
    return {
        "status": "ok",
        "low_max": orchestrator.threshold_mgr.low_max,
        "medium_max": orchestrator.threshold_mgr.medium_max,
    }
