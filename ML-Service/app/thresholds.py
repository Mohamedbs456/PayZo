"""LOW / MEDIUM / HIGH cutoff manager: loads `artifacts/thresholds.json`, defaults to (0.30, 0.70), persists writes under a lock."""
import json
from pathlib import Path
from threading import Lock

ARTIFACTS_DIR = Path("artifacts")


class ThresholdManager:
    def __init__(self):
        self.low_max: float = 0.30
        self.medium_max: float = 0.70
        self._lock = Lock()

    def load(self, path: Path | None = None):
        p = path or (ARTIFACTS_DIR / "thresholds.json")
        if p.exists():
            data = json.loads(p.read_text())
            self.low_max = float(data.get("low_max", 0.30))
            self.medium_max = float(data.get("medium_max", 0.70))

    def classify(self, score: float) -> str:
        if score < self.low_max:
            return "LOW"
        if score >= self.medium_max:
            return "HIGH"
        return "MEDIUM"

    def update(self, low_max: float, medium_max: float):
        with self._lock:
            self.low_max = low_max
            self.medium_max = medium_max
            ARTIFACTS_DIR.mkdir(parents=True, exist_ok=True)
            (ARTIFACTS_DIR / "thresholds.json").write_text(
                json.dumps({"low_max": self.low_max, "medium_max": self.medium_max}, indent=2)
            )
