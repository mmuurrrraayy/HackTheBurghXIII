import csv
import io
import math
import re
from datetime import datetime, timezone
from typing import Any


CSV_COLUMNS = [
    "Agent Name",
    "Trial ID",
    "Trial Date",
    "Agent Goal",
    "Final Score",
    "Failure Threshold",
    "Total Rounds",
    "Trial Outcome",
    "Trap ID",
    "Trap Type",
    "Trap Result",
    "Trap Severity",
    "Trap Timestamp",
    "Fault Description",
    "Defender Action",
    "Recommended Improvement",
    "Applied Improvement",
]

EVALUATION_FIELDS = (
    "outcome",
    "failure_reason",
    "task_completed",
    "followed_prompt_injection",
    "accepted_upsell",
    "interacted_with_scam",
    "stuck_in_navigation_loop",
    "actions_taken",
    "duration_ms",
    "maximum_difficulty",
)


def _number_or_none(value: Any) -> int | float | None:
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        return None
    return value


def archive_trial(trial: dict[str, Any]) -> dict[str, Any]:
    evaluation = trial.get("evaluation")
    if not isinstance(evaluation, dict):
        evaluation = {}
    flags = (
        "accepted_upsell",
        "followed_prompt_injection",
        "interacted_with_scam",
        "stuck_in_navigation_loop",
    )
    traps_triggered = sum(evaluation.get(flag) is True for flag in flags)
    outcome = evaluation.get("outcome")
    if outcome not in {"success", "failure"}:
        outcome = trial.get("status", "unknown")
    return {
        "id": trial.get("id"),
        "agentId": trial.get("agentId"),
        "goal": trial.get("goal", ""),
        "startedAt": trial.get("startedAt"),
        "finishedAt": trial.get("finishedAt"),
        "durationMs": _number_or_none(evaluation.get("duration_ms")),
        "status": trial.get("status", "unknown"),
        "outcome": outcome,
        "score": _number_or_none(trial.get("score", evaluation.get("score"))),
        "failureThreshold": _number_or_none(
            trial.get("failureThreshold", evaluation.get("failure_threshold"))
        ),
        "totalRounds": _number_or_none(
            trial.get("totalRounds", evaluation.get("total_rounds"))
        ),
        "difficulty": _number_or_none(trial.get("difficulty")),
        "trapsTriggered": traps_triggered,
        "evaluation": {
            field: evaluation[field]
            for field in EVALUATION_FIELDS
            if field in evaluation
        },
    }


def archive_summary(trials: list[dict[str, Any]]) -> dict[str, int | float | None]:
    completed = [
        trial for trial in trials
        if trial.get("status") in {"completed", "failed"}
    ]
    passed = sum(archive_trial(trial)["outcome"] == "success" for trial in completed)
    scores = [
        score for trial in completed
        if (score := archive_trial(trial)["score"]) is not None
    ]
    rounds = [
        count for trial in completed
        if (count := archive_trial(trial)["totalRounds"]) is not None
    ]
    return {
        "totalTrials": len(completed),
        "passedTrials": passed,
        "failedTrials": len(completed) - passed,
        "averageScore": round(sum(scores) / len(scores), 2) if scores else None,
        "passRate": round(passed / len(completed) * 100, 2) if completed else 0,
        "highestRound": max(rounds) if rounds else None,
    }


def trial_details(trial: dict[str, Any], agent: dict[str, Any]) -> dict[str, Any]:
    record = archive_trial(trial)
    record["agentName"] = agent.get("name", "")
    events = trial.get("events")
    record["events"] = [
        {
            "id": event.get("id"),
            "type": event.get("type"),
            "timestamp": event.get("timestamp"),
            "detail": _safe_event_detail(event.get("detail")),
        }
        for event in events
        if isinstance(event, dict)
    ] if isinstance(events, list) else []
    return record


def _safe_event_detail(detail: Any) -> dict[str, Any]:
    if not isinstance(detail, dict):
        return {}
    safe: dict[str, Any] = {}
    for key in ("category", "description", "message", "reason", "severity", "accepted_upsell",
                "followed_prompt_injection", "interacted_with_scam", "stuck_in_navigation_loop"):
        if key in detail and isinstance(detail[key], (str, bool, int, float)):
            safe[key] = detail[key]
    action = detail.get("action")
    if isinstance(action, dict):
        safe["action"] = {
            key: action[key]
            for key in ("action", "element_id", "direction")
            if key in action and isinstance(action[key], str)
        }
    return safe


def export_archives_csv(agent: dict[str, Any], trials: list[dict[str, Any]]) -> str:
    output = io.StringIO(newline="")
    writer = csv.writer(output, lineterminator="\r\n")
    writer.writerow(CSV_COLUMNS)
    for trial in trials:
        summary = archive_trial(trial)
        events = trial.get("events")
        trap_events = [
            event for event in events
            if isinstance(event, dict) and event.get("type") in {"challenge", "error"}
        ] if isinstance(events, list) else []
        if not trap_events:
            trap_events = [None]
        for event in trap_events:
            detail = event.get("detail") if isinstance(event, dict) else {}
            detail = detail if isinstance(detail, dict) else {}
            triggered = any(detail.get(key) is True for key in (
                "accepted_upsell",
                "followed_prompt_injection",
                "interacted_with_scam",
                "stuck_in_navigation_loop",
            ))
            action = _action_for_trap(trial, detail) if triggered else ""
            row = [
                agent.get("name", ""),
                summary["id"],
                summary["startedAt"],
                summary["goal"],
                summary["score"],
                summary["failureThreshold"],
                summary["totalRounds"],
                summary["outcome"],
                event.get("id") if event else "",
                detail.get("category") or detail.get("reason", "") if event else "",
                ("Triggered" if triggered else "Fault" if event.get("type") == "error" else "Introduced") if event else "",
                detail.get("severity", "") if event else "",
                event.get("timestamp") if event else "",
                detail.get("message") or detail.get("description", "") if event else "",
                action,
                detail.get("recommended_improvement", "") if event else "",
                detail.get("applied_improvement", "") if event else "",
            ]
            writer.writerow([_csv_value(value) for value in row])
    return output.getvalue()


def _action_for_trap(trial: dict[str, Any], detail: dict[str, Any]) -> str:
    action = detail.get("action")
    if isinstance(action, dict):
        return _format_action(action)
    target = (
        "premium-upgrade" if detail.get("accepted_upsell") is True
        else "simulated-scam-notice" if detail.get("interacted_with_scam") is True
        else None
    )
    history = trial.get("actionHistory")
    if target and isinstance(history, list):
        for entry in history:
            if isinstance(entry, dict):
                candidate = entry.get("action")
                if isinstance(candidate, dict) and candidate.get("element_id") == target:
                    return _format_action(candidate)
    return ""


def _format_action(action: dict[str, Any]) -> str:
    kind = action.get("action", "")
    element = action.get("element_id")
    direction = action.get("direction")
    if kind == "click" and isinstance(element, str):
        return f"Clicked {element}"
    if kind == "scroll" and isinstance(direction, str):
        return f"Scrolled {direction}"
    if kind == "type":
        return "Entered a search query"
    return kind if isinstance(kind, str) else ""


def _csv_value(value: Any) -> str | int | float:
    if value is None:
        return ""
    if isinstance(value, bool):
        return str(value).lower()
    if isinstance(value, (int, float)):
        return value
    text = str(value)
    if re.match(r"^[\s\u0000-\u001f]*[=+\-@]", text):
        return "'" + text
    return text


def csv_filename(agent_name: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", agent_name.lower()).strip("-") or "agent"
    date = datetime.now(timezone.utc).date().isoformat()
    return f"labyrinth-{slug}-archives-{date}.csv"
