"""Tier 3 — Deterministic YAML-driven rule firewall.

This is the final layer when both ML tiers are unavailable. Each rule is a
named Python predicate registered with @rule; the runtime engine reads
config/rules.yaml at startup, binds each rule's `condition` string to a Python
function, and evaluates them in order against the incoming feature dict.

Decisions combine by maximum severity: BLOCK > REVIEW > ALLOW.

Train-time helpers compute percentile-based parameter values from the actual
data distribution (e.g. "amount_percentile: 0.99" → resolved TND value) and
persist the resolved cuts to `artifacts/tier3_thresholds.json`.
"""
from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Callable

import numpy as np
import pandas as pd
import yaml

ARTIFACTS_DIR = Path("artifacts")
TIER3_THRESHOLDS_PATH = ARTIFACTS_DIR / "tier3_thresholds.json"

SEVERITY_ORDER = {"ALLOW": 0, "REVIEW": 1, "BLOCK": 2}


# --------------------------------------------------------------------------- #
# Rule registry (decorator-based, name -> function).
# --------------------------------------------------------------------------- #
_REGISTRY: dict[str, Callable[..., bool]] = {}


def rule(name: str):
    """Register a predicate so it can be referenced by name from rules.yaml."""
    def wrapper(fn: Callable[..., bool]):
        _REGISTRY[name] = fn
        return fn
    return wrapper


@dataclass
class RuleVerdict:
    decision: str                   # ALLOW | REVIEW | BLOCK
    fired: list[str]                # rule ids that matched
    reasons: list[str]              # reason strings from matched rules
    severity: str                   # max severity reached


# --------------------------------------------------------------------------- #
# Built-in predicates (referenced from rules.yaml).
#
# Each predicate receives:
#   feat:     dict of {feature_name: value} (12 entries from feature_engineering)
#   request:  the raw ScoreRequest dict (camelCase) — gives access to amount/hour
#   params:   the rule's params dict from YAML (already with percentile-resolved cuts)
# --------------------------------------------------------------------------- #
@rule("amount_above_percentile_and_new_beneficiary")
def _r_amount_p99_new_beneficiary(feat, request, params) -> bool:
    # `resolved_amount_threshold` is filled in at train time.
    threshold = params.get("resolved_amount_threshold")
    if threshold is None:
        return False
    # log_amount in the feature dict is log1p(amount). Recover amount.
    amount = float(np.expm1(feat["log_amount"]))
    # "New beneficiary" proxy: sender_distinct_dest_24h <= 1 AND first time today.
    is_new_beneficiary = feat["sender_distinct_dest_24h"] <= 1
    return amount > threshold and is_new_beneficiary


@rule("night_amount_threshold")
def _r_night_amount(feat, request, params) -> bool:
    amount_min = params["amount_min"]
    amount = float(np.expm1(feat["log_amount"]))
    hour = int(feat.get("hour_of_day", 14))
    is_night = hour < 6 or hour >= 22
    return is_night and amount > amount_min


@rule("velocity_check")
def _r_velocity(feat, request, params) -> bool:
    return (
        feat["sender_tx_count_24h"] >= params["tx_count_min"]
        and feat["sender_distinct_dest_24h"] >= params["distinct_dest_min"]
    )


@rule("new_account_large_amount")
def _r_new_account_large(feat, request, params) -> bool:
    amount = float(np.expm1(feat["log_amount"]))
    return (
        feat["sender_account_age_days"] < params["max_age_days"]
        and amount > params["amount_min"]
    )


@rule("savings_night_large")
def _r_savings_night_large(feat, request, params) -> bool:
    amount = float(np.expm1(feat["log_amount"]))
    is_savings = feat.get("account_type_savings", 0) == 1
    hour = int(feat.get("hour_of_day", 14))
    is_night = hour < 6 or hour >= 22
    return is_savings and is_night and amount > params["amount_min"]


# --------------------------------------------------------------------------- #
# Engine
# --------------------------------------------------------------------------- #
class RuleFirewall:
    def __init__(self):
        self.rules: list[dict] = []
        self.is_loaded = False

    def load(self, rules_yaml_path: str | Path = "config/rules.yaml") -> "RuleFirewall":
        raw = yaml.safe_load(Path(rules_yaml_path).read_text())
        rules = raw.get("rules", [])

        # Merge train-time-resolved thresholds (e.g. percentile cuts).
        resolved_path = TIER3_THRESHOLDS_PATH
        resolved = {}
        if resolved_path.exists():
            resolved = json.loads(resolved_path.read_text())

        for r in rules:
            if r["id"] in resolved:
                r["params"] = {**r.get("params", {}), **resolved[r["id"]]}

        self.rules = rules
        self.is_loaded = True
        return self

    def evaluate(self, feat: dict, request: dict) -> RuleVerdict:
        if not self.is_loaded:
            return RuleVerdict(decision="ALLOW", fired=[], reasons=[], severity="ALLOW")

        fired: list[tuple[str, str, str]] = []   # (id, decision, reason)
        for r in self.rules:
            fn = _REGISTRY.get(r["condition"])
            if fn is None:
                continue
            try:
                if fn(feat, request, r.get("params", {})):
                    fired.append((r["id"], r["decision"], r["reason"]))
            except Exception:
                # Individual rule errors must not block evaluation.
                continue

        if not fired:
            return RuleVerdict(decision="ALLOW", fired=[], reasons=[], severity="ALLOW")

        # Max-severity wins; collect all matched reasons.
        max_severity_idx = max(SEVERITY_ORDER[d] for _, d, _ in fired)
        winning_decision = {v: k for k, v in SEVERITY_ORDER.items()}[max_severity_idx]
        return RuleVerdict(
            decision=winning_decision,
            fired=[f[0] for f in fired],
            reasons=list(dict.fromkeys([f[2] for f in fired])),  # dedupe preserving order
            severity=winning_decision,
        )


# --------------------------------------------------------------------------- #
# Training helpers — resolve percentile parameters from real data and validate
# rule fire rates against the false-positive budget.
# --------------------------------------------------------------------------- #
def resolve_train_time_thresholds(
    rules_yaml_path: str | Path,
    train_features_df: pd.DataFrame,
) -> dict:
    """Resolve any percentile-based parameters in rules.yaml against train data.

    Currently handles:
      * `amount_percentile` → resolved_amount_threshold (TND amount cut)

    Returns: {rule_id: {param_name: resolved_value, ...}}
    Also writes the resolved values to artifacts/tier3_thresholds.json so the
    inference-time `RuleFirewall.load()` picks them up.
    """
    raw = yaml.safe_load(Path(rules_yaml_path).read_text())
    rules = raw.get("rules", [])

    # Recover original amount from log_amount.
    amounts = np.expm1(train_features_df["log_amount"].to_numpy())

    resolved: dict[str, dict] = {}
    for r in rules:
        params = r.get("params", {})
        if "amount_percentile" in params:
            p = float(params["amount_percentile"])
            cut = float(np.quantile(amounts, p))
            resolved.setdefault(r["id"], {})["resolved_amount_threshold"] = cut

    ARTIFACTS_DIR.mkdir(parents=True, exist_ok=True)
    TIER3_THRESHOLDS_PATH.write_text(json.dumps(resolved, indent=2))
    return resolved


def validate_fire_rates(
    rules_yaml_path: str | Path,
    train_features_df: pd.DataFrame,
    fp_budget: float,
) -> dict:
    """For each rule, compute fire rate on legit-only train rows.

    Assert each rule's legit fire rate <= fp_budget (default 5%).

    Returns: {rule_id: {fire_rate: float, fire_count: int, pass: bool}}
    """
    firewall = RuleFirewall().load(rules_yaml_path)
    legit = train_features_df[train_features_df["is_fraud"] == 0]
    feature_cols = [c for c in train_features_df.columns
                    if c not in ("transaction_id", "client_id", "created_at", "is_fraud", "fraud_archetype")]

    results: dict[str, dict] = {}
    fire_counts: dict[str, int] = {}
    for _, row in legit.iterrows():
        feat = {c: row[c] for c in feature_cols}
        request = {}
        for r in firewall.rules:
            fn = _REGISTRY.get(r["condition"])
            if fn is None:
                continue
            try:
                if fn(feat, request, r.get("params", {})):
                    fire_counts[r["id"]] = fire_counts.get(r["id"], 0) + 1
            except Exception:
                continue

    total_legit = max(len(legit), 1)
    for r in firewall.rules:
        cnt = fire_counts.get(r["id"], 0)
        rate = cnt / total_legit
        results[r["id"]] = {
            "fire_count": cnt,
            "legit_total": total_legit,
            "fire_rate": round(rate, 5),
            "pass": rate <= fp_budget,
        }
    return results
