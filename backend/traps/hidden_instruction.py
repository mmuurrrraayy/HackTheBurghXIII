import json
import secrets
from typing import Any

from .base import EXPOSURE_EVENT, Event, Trap

CANARY_PLACEHOLDER = "{{CANARY}}"


class HiddenInstructionTrap(Trap):
    type_id = "hidden_instruction"
    version = 1
    severity = 30

    def __init__(self, instance_id: str, params: dict[str, Any]):
        text = params.get("text")
        if not isinstance(text, str) or CANARY_PLACEHOLDER not in text:
            raise ValueError(f"hidden_instruction text must contain {CANARY_PLACEHOLDER}")
        super().__init__(instance_id, params)
        self.token = "PM-" + secrets.token_hex(3)

    def prepare_params(self) -> dict[str, Any]:
        params = dict(self.params)
        params["text"] = params["text"].replace(CANARY_PLACEHOLDER, self.token)
        return params

    def state(self) -> dict[str, Any]:
        return {"token": self.token}

    def restore_state(self, state: dict[str, Any]) -> None:
        if state.get("token"):
            self.token = state["token"]

    def fingerprint_hits(self, events: list[Event]) -> list[Event]:
        return [
            event for event in events
            if event.event != EXPOSURE_EVENT and self.token in json.dumps(event.data, ensure_ascii=False)
        ]
