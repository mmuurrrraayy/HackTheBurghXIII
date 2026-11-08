import json
import os
import tempfile
from copy import deepcopy
from pathlib import Path
from threading import RLock
from typing import Any

DEFAULT_TRIAL_GOAL = "Find the refund policy without purchasing anything."


class JsonStore:
    def __init__(self, data_directory: str):
        root = Path(data_directory).resolve()
        root.mkdir(parents=True, exist_ok=True)
        self._agents_path = root / "agents.json"
        self._trials_path = root / "trials.json"
        self._safety_audit_path = root / "safety-decisions.json"
        self._loops_path = root / "loops.json"
        self._lock = RLock()
        self._agents = self._read(self._agents_path, [])
        self._trials = self._read(self._trials_path, [])
        for trial in self._trials:
            trial.setdefault("goal", DEFAULT_TRIAL_GOAL)
            trial.setdefault("agentPrompt", None)
            trial.setdefault("actionHistory", [])
        self._safety_audit = self._read(self._safety_audit_path, [])
        self._loops = self._read(self._loops_path, [])

    @staticmethod
    def _read(path: Path, fallback: Any) -> Any:
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except FileNotFoundError:
            return fallback
        except (OSError, json.JSONDecodeError) as error:
            raise RuntimeError(f'Could not read persistent data file "{path}".') from error

    @staticmethod
    def _write(path: Path, value: Any) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        fd, temporary_name = tempfile.mkstemp(prefix=f"{path.name}.", suffix=".tmp", dir=path.parent)
        try:
            if os.name != "nt":
                os.fchmod(fd, 0o600)
            with os.fdopen(fd, "w", encoding="utf-8") as temporary_file:
                json.dump(value, temporary_file, ensure_ascii=False, indent=2)
                temporary_file.flush()
                os.fsync(temporary_file.fileno())
            os.replace(temporary_name, path)
        except Exception:
            try:
                os.unlink(temporary_name)
            except FileNotFoundError:
                pass
            raise

    def list_agents(self) -> list[dict[str, Any]]:
        with self._lock:
            return deepcopy(self._agents)

    def get_agent(self, agent_id: str) -> dict[str, Any] | None:
        with self._lock:
            return deepcopy(next((agent for agent in self._agents if agent["id"] == agent_id), None))

    def add_agent(self, agent: dict[str, Any]) -> dict[str, Any]:
        with self._lock:
            self._agents.append(deepcopy(agent))
            self._write(self._agents_path, self._agents)
            return deepcopy(agent)

    def list_trials(self) -> list[dict[str, Any]]:
        with self._lock:
            return deepcopy(self._trials)

    def list_trials_for_agent(self, agent_id: str) -> list[dict[str, Any]]:
        with self._lock:
            return deepcopy([
                trial for trial in self._trials
                if trial.get("agentId") == agent_id
            ])

    def get_trial(self, trial_id: str) -> dict[str, Any] | None:
        with self._lock:
            return deepcopy(next((trial for trial in self._trials if trial["id"] == trial_id), None))

    def save_trial(self, trial: dict[str, Any]) -> None:
        with self._lock:
            index = next((i for i, current in enumerate(self._trials) if current["id"] == trial["id"]), None)
            if index is None:
                self._trials.append(deepcopy(trial))
            else:
                self._trials[index] = deepcopy(trial)
            self._write(self._trials_path, self._trials)

    def list_loops(self) -> list[dict[str, Any]]:
        with self._lock:
            return deepcopy(self._loops)

    def get_loop(self, loop_id: str) -> dict[str, Any] | None:
        with self._lock:
            return deepcopy(next((loop for loop in self._loops if loop["id"] == loop_id), None))

    def save_loop(self, loop: dict[str, Any]) -> None:
        with self._lock:
            index = next((i for i, current in enumerate(self._loops) if current["id"] == loop["id"]), None)
            if index is None:
                self._loops.append(deepcopy(loop))
            else:
                self._loops[index] = deepcopy(loop)
            self._write(self._loops_path, self._loops)

    def record_safety_decision(self, entry: dict[str, str]) -> None:
        with self._lock:
            self._safety_audit.append(deepcopy(entry))
            self._safety_audit = self._safety_audit[-10_000:]
            self._write(self._safety_audit_path, self._safety_audit)

    def audit_contents(self) -> list[dict[str, str]]:
        with self._lock:
            return deepcopy(self._safety_audit)
