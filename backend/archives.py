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


def archive_summary(trials: list[dict[str, Any]], loops: list[dict[str, Any]] = ()) -> dict[str, int | float | None]:
    records = [archive_trial(trial) for trial in trials] + [archive_loop(loop) for loop in loops]
    completed = [record for record in records if record["status"] in {"completed", "failed"}]
    passed = sum(record["outcome"] == "success" for record in completed)
    scores = [record["score"] for record in completed if record["score"] is not None]
    rounds = [record["totalRounds"] for record in completed if record["totalRounds"] is not None]
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


def export_archives_csv(agent: dict[str, Any], trials: list[dict[str, Any]], loops: list[dict[str, Any]] = ()) -> str:
    output = io.StringIO(newline="")
    writer = csv.writer(output, lineterminator="\r\n")
    writer.writerow(CSV_COLUMNS)
    for loop in loops:
        for row in _loop_csv_rows(agent, loop):
            writer.writerow([_csv_value(value) for value in row])
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


# ---- Trial loops (the villain -> site -> agent -> feedback rounds started by Go) ----

TRAP_NAMES = {
    "preticked_addon": "Pre-ticked add-on",
    "hidden_instruction": "Hidden instruction",
    "confirmshaming": "Confirmshaming",
    "drip_pricing": "Drip pricing",
    "fake_countdown": "Fake countdown",
    "disguised_ad": "Disguised ad",
    "hard_cancel": "Hard cancel",
}


def _trap_name(type_id: str) -> str:
    return TRAP_NAMES.get(type_id, type_id.replace("_", " "))


def _scored_rounds(loop: dict[str, Any]) -> list[dict[str, Any]]:
    rounds = loop.get("rounds")
    return [r for r in rounds if isinstance(r, dict) and r.get("status") == "scored"] if isinstance(rounds, list) else []


def _duration_ms(start: Any, end: Any) -> int | None:
    try:
        started = datetime.fromisoformat(str(start).replace("Z", "+00:00"))
        finished = datetime.fromisoformat(str(end).replace("Z", "+00:00"))
    except ValueError:
        return None
    return max(0, int((finished - started).total_seconds() * 1000))


def _triggered(rounds: list[dict[str, Any]], *type_ids: str) -> bool:
    return any(v.get("triggered") and v.get("type_id") in type_ids for r in rounds for v in r.get("verdicts", []))


def archive_loop(loop: dict[str, Any]) -> dict[str, Any]:
    """A trial loop in the same shape as archive_trial, so Archives lists both."""
    rounds = _scored_rounds(loop)
    status = loop.get("status", "unknown")
    passed_all = loop.get("outcome") == "agent_passed_all_rounds"
    outcome = status if status == "running" else "success" if passed_all and status == "completed" else "failure"
    duration = _duration_ms(loop.get("startedAt"), loop.get("finishedAt")) if loop.get("finishedAt") else None
    last = rounds[-1] if rounds else {}
    final = [r for r in rounds if r.get("attempt") == last.get("attempt")]  # earlier attempts failed
    failure_reason = None
    if outcome == "failure":
        failure_reason = loop.get("error") or (
            f"Round {last.get('round')} scored {last.get('score')} (threshold {loop.get('threshold')})." if last else None
        )
    evaluation = {
        "outcome": outcome,
        "failure_reason": failure_reason,
        "task_completed": passed_all,
        "followed_prompt_injection": _triggered(final, "hidden_instruction"),
        "accepted_upsell": _triggered(final, "preticked_addon", "confirmshaming"),
        "interacted_with_scam": False,
        "stuck_in_navigation_loop": False,
        "actions_taken": len(rounds),
        "duration_ms": duration,
        "maximum_difficulty": max((r.get("round") or 0 for r in rounds), default=None),
    }
    return {
        "id": loop.get("id"),
        "agentId": loop.get("agentId"),
        "goal": loop.get("goal", ""),
        "startedAt": loop.get("startedAt"),
        "finishedAt": loop.get("finishedAt"),
        "durationMs": duration,
        "status": status,
        "outcome": outcome,
        "score": _number_or_none(last.get("score")),
        "failureThreshold": _number_or_none(loop.get("threshold")),
        "totalRounds": len(rounds),
        "difficulty": evaluation["maximum_difficulty"],
        "trapsTriggered": sum(bool(v.get("triggered")) for r in rounds for v in r.get("verdicts", [])),
        "evaluation": evaluation,
        "kind": "loop",
        "attempts": max((r.get("attempt") or 1 for r in rounds), default=0),
    }


def describe_reply(reply: Any) -> str:
    """The agent's JSON booking summary as one readable line (falls back to the raw text)."""
    import json

    text = str(reply or "")
    try:
        data = json.loads(text)
    except ValueError:
        return text[:400] or "No reply recorded."
    if not isinstance(data, dict):
        return text[:400]

    def listed(key: str) -> str:
        items = data.get(key)
        return ", ".join(str(item) for item in items) if isinstance(items, list) and items else "none"

    parts = [
        f"Booked {data.get('room') or 'no room'}",
        f"extras kept: {listed('extras')}",
        f"offers accepted: {listed('offers_accepted')}",
        f"fees noted: {listed('fees')}",
        f"notes: {data.get('notes') or 'none'}",
    ]
    return " · ".join(parts)[:400]


def _round_label(entry: dict[str, Any]) -> str:
    return f"Attempt {entry.get('attempt') or 1} · Round {entry.get('round')}"


def loop_details(loop: dict[str, Any], agent: dict[str, Any]) -> dict[str, Any]:
    """Archive detail for a loop: one trap event per trap per round, plus the agent's booking per round."""
    record = archive_loop(loop)
    record["agentName"] = agent.get("name", "")
    events: list[dict[str, Any]] = []
    for index, entry in enumerate(_scored_rounds(loop), start=1):
        label = _round_label(entry)
        for verdict in entry.get("verdicts", []):
            name = _trap_name(verdict.get("type_id", ""))
            result = "fell for it" if verdict.get("triggered") else "avoided it" if verdict.get("exposed") else "did not see it"
            events.append({
                "id": f"{loop.get('id')}-s{index}-{verdict.get('instance_id')}",
                "type": "challenge",
                "timestamp": entry.get("finishedAt"),
                "detail": {
                    "category": name,
                    "description": f"{label}: the agent {result}.",
                    "severity": verdict.get("severity"),
                    "triggered": bool(verdict.get("triggered")),
                    "round": entry.get("round"),
                    "attempt": entry.get("attempt") or 1,
                },
            })
        events.append({
            "id": f"{loop.get('id')}-s{index}-reply",
            "type": "defender_action",
            "timestamp": entry.get("finishedAt"),
            "detail": {
                "message": f"{label} (score {entry.get('score')}): {describe_reply(entry.get('agentReply'))}",
                "round": entry.get("round"),
                "attempt": entry.get("attempt") or 1,
            },
        })
    if loop.get("status") == "failed" and loop.get("error"):
        events.append({"id": f"{loop.get('id')}-error", "type": "error", "timestamp": loop.get("finishedAt"),
                       "detail": {"reason": "trial_error", "message": loop["error"]}})
    record["events"] = events
    record["improvements"] = [
        {
            "label": _round_label(entry),
            "traps": [_trap_name(v.get("type_id", "")) for v in entry.get("verdicts", []) if v.get("triggered")],
            "prompt": entry["feedback"].get("prompt", ""),
            "applied": bool(entry["feedback"].get("applied")),
        }
        for entry in _scored_rounds(loop)
        if isinstance(entry.get("feedback"), dict) and entry["feedback"].get("target") == "user"
    ]
    return record


def _loop_csv_rows(agent: dict[str, Any], loop: dict[str, Any]) -> list[list[Any]]:
    from .feedback import TRAP_GUIDANCE

    summary = archive_loop(loop)
    base = [agent.get("name", ""), summary["id"], summary["startedAt"], summary["goal"], summary["score"],
            summary["failureThreshold"], summary["totalRounds"], summary["outcome"]]
    rows = []
    for index, entry in enumerate(_scored_rounds(loop), start=1):
        prompt = entry.get("feedback") if isinstance(entry.get("feedback"), dict) else {}
        user_prompt = prompt.get("prompt", "") if prompt.get("target") == "user" else ""
        applied = ("Applied automatically (demo)" if prompt.get("applied") else "Pending: apply to the agent") if user_prompt else ""
        for verdict in entry.get("verdicts", []):
            triggered = bool(verdict.get("triggered"))
            rows.append(base + [
                f"{_round_label(entry)} · {verdict.get('instance_id')}",
                verdict.get("type_id", ""),
                "Triggered" if triggered else "Avoided" if verdict.get("exposed") else "Not seen",
                verdict.get("severity"),
                entry.get("finishedAt"),
                TRAP_GUIDANCE.get(verdict.get("type_id", ""), "Agent fell for this trap.") if triggered else "",
                describe_reply(entry.get("agentReply")) if triggered else "",
                user_prompt if triggered else "",
                applied if triggered else "",
            ])
    if not rows:
        rows.append(base + [""] * (len(CSV_COLUMNS) - len(base)))
    return rows
