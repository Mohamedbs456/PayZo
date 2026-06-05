# PayZo ML Training Report

- **Started:** 2026-06-04T14:46:10.131494+00:00
- **Finished:** 2026-06-04T14:56:11.789028+00:00
- **Total seconds:** 601.7

## Stage timings
- load_config: 0.0s
- synthetic_data: 137.2s
- feature_engineering: 49.3s
- temporal_split: 0.1s
- candidates_train: 368.0s
- promote: 1.0s
- test_eval: 2.9s
- tier3_validate: 42.1s
- derive_thresholds: 0.0s
- leakage_audit: 0.5s
- e2e_smoke: 0.5s

## Data counts
- banks: 15
- users: 10000
- accounts: 12000
- transactions: 500000
- transactions_fraud: 7500
- fraud_alerts: 7500
- trust_score_history: 17500
- beneficiaries: 73280

## Decision thresholds
- low_max: 0.3
- medium_max: 0.7
- modelVersion: payzo-tier1-lightgbm-v5

## Tier 1
### Tier 1 (XGBoost)
- modelVersion: payzo-tier1-lightgbm-v5
- PR-AUC: 0.8716
- ROC-AUC: 0.9903
- F1: 0.8144
- Precision: 0.8144
- Recall: 0.8144
- Precision@top1%: 0.9930
- Recall@top1%: 0.6564
- Optimal threshold (F1): 0.2449
- Train seconds: 42.06

### Top feature importances
- velocity_relative_to_user_norm: 0.1958
- hour_of_day: 0.1458
- log_amount: 0.1105
- days_since_user_account_anomaly: 0.0855
- transfers_to_dest_lifetime: 0.0618
- amount_to_balance_ratio: 0.0576
- amount_pct_of_user_max_lifetime: 0.0468
- dest_familiarity_score: 0.0463
- distance_km: 0.0403
- hour_likelihood_for_user: 0.0303

## Tier 2
### Tier 2 (Random Forest)
- modelVersion: payzo-tier2-random_forest-v5
- PR-AUC: 0.8287
- ROC-AUC: 0.9861
- F1: 0.7961
- Precision: 0.8463
- Recall: 0.7515
- Precision@top1%: 0.9582
- Recall@top1%: 0.6334
- Optimal threshold (F1): 0.45
- Train seconds: 47.58

## Held-out test-split metrics
### Tier 1 (test)
- modelVersion: ?
- PR-AUC: 0.9058
- ROC-AUC: 0.9926
- F1: 0.8818
- Precision: 0.9739
- Recall: 0.8056
- Precision@top1%: 0.9988
- Recall@top1%: 0.6910
- Optimal threshold (F1): 0.75
- Train seconds: ?

### Tier 2 (test)
- modelVersion: ?
- PR-AUC: 0.8761
- ROC-AUC: 0.9886
- F1: 0.8349
- Precision: 0.8654
- Recall: 0.8065
- Precision@top1%: 0.9784
- Recall@top1%: 0.6769
- Optimal threshold (F1): 0.3791
- Train seconds: ?

## Tier 3 rule fire rates
- R001_AMOUNT_P99_NEW_BENEFICIARY: 0.514% (1885/366865) [PASS]
- R002_NIGHT_HIGH_AMOUNT: 0.930% (3412/366865) [PASS]
- R003_VELOCITY_BURST: 0.535% (1961/366865) [PASS]
- R004_NEW_ACCOUNT_LARGE: 2.367% (8684/366865) [PASS]
- R005_SAVINGS_LARGE_NIGHT: 0.000% (0/366865) [PASS]

## Tier 3 resolved thresholds
- R001_AMOUNT_P99_NEW_BENEFICIARY.resolved_amount_threshold: 33817.98

## Leakage audit
- sampled: 200
- checked: 178
- mismatches: 0

## End-to-end smoke
- legit: tier=TIER1 decision=ALLOW risk=0.001 level=LOW expected=ALLOW
- TAKEOVER: tier=TIER1 decision=BLOCK risk=1.000 level=HIGH expected=BLOCK
- CARD_TESTING: tier=TIER1 decision=BLOCK risk=1.000 level=HIGH expected=BLOCK
- LARGE_UNUSUAL: tier=TIER1 decision=BLOCK risk=1.000 level=HIGH expected=BLOCK
- SLOW_DRAIN: tier=TIER1 decision=REVIEW risk=0.593 level=MEDIUM expected=BLOCK **[MISMATCH]**
- SAVINGS_FRAUD: tier=TIER1 decision=BLOCK risk=1.000 level=HIGH expected=BLOCK

_Soft check: 1 fixture(s) off expected decision (SLOW_DRAIN) — informational, not a gate._
