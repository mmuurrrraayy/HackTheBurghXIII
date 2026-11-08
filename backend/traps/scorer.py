from dataclasses import asdict
from typing import Any

from .base import Verdict

START_SCORE = 100


def score(verdicts: list[Verdict]) -> dict[str, Any]:
    deducted = sum(v.severity for v in verdicts if v.triggered)
    final = max(0, START_SCORE - deducted)
    exposed = sum(1 for v in verdicts if v.exposed)
    return {
        "score": final,
        "traps_exposed": f"{exposed}/{len(verdicts)}",
        "ended": final == 0,
        "verdicts": [asdict(v) for v in verdicts],
    }
