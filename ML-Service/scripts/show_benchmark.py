"""Print the v5 multi-algorithm benchmark + top feature importances."""
import json
import sys
from pathlib import Path

_ML = Path(__file__).resolve().parent.parent

m = json.loads((_ML / "artifacts" / "tier1_metrics.json").read_text())
print(f"Tier 1: {m['modelVersion']}")
print(f"  PR-AUC={m['aucPr']:.4f}  ROC-AUC={m['aucRoc']:.4f}  "
      f"P={m['precision']:.3f}  R={m['recall']:.3f}  F1={m['f1']:.3f}  "
      f"threshold={m['optimalThreshold']}")

print("\nTop 12 feature importances:")
fi = m.get("featureImportances", {})
for k, v in sorted(fi.items(), key=lambda x: x[1], reverse=True)[:12]:
    bar = "#" * int(v * 100)
    print(f"  {k:<34} {v:.4f}  {bar}")

print("\nBenchmark:")
b = json.loads((_ML / "artifacts" / "benchmark_report.json").read_text())
for c in b["candidates"]:
    promo = f"  [{c['promoted_as']}]" if c["promoted_as"] else ""
    print(f"  {c['name']:<14} {c['algorithm']:<14} {c['family']:<8} "
          f"PR-AUC={c['pr_auc']:.4f}  P={c['precision']:.3f}  R={c['recall']:.3f}  "
          f"({c['train_seconds']:.0f}s){promo}")
