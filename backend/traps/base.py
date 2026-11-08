from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any

EXPOSURE_EVENT = "trap_exposed"


@dataclass
class Event:
    t: int
    event: str
    data: dict[str, Any] = field(default_factory=dict)


@dataclass
class Verdict:
    type_id: str
    instance_id: str
    exposed: bool
    triggered: bool
    severity: int
    evidence: list[dict[str, Any]]
    note: str


class Trap(ABC):
    type_id: str = ""
    version: int = 1
    severity: int = 0

    def __init__(self, instance_id: str, params: dict[str, Any]):
        self.instance_id = instance_id
        self.params = dict(params)

    def prepare_params(self) -> dict[str, Any]:
        """Params sent to the site. Subclasses may inject fingerprints here."""
        return dict(self.params)

    def state(self) -> dict[str, Any]:
        """Per-run values needed to rebuild this trap from persisted storage."""
        return {}

    def restore_state(self, state: dict[str, Any]) -> None:
        pass

    def exposure_time(self, events: list[Event]) -> int | None:
        for event in events:
            if event.event == EXPOSURE_EVENT and event.data.get("instance_id") == self.instance_id:
                return event.t
        return None

    @abstractmethod
    def fingerprint_hits(self, events: list[Event]) -> list[Event]:
        """Events carrying this instance's own fingerprint, regardless of timing."""

    def evaluate(self, events: list[Event]) -> Verdict:
        # Final on purpose: the exposed AND later-fingerprint rule lives only here.
        exposed_at = self.exposure_time(events)
        if exposed_at is None:
            return Verdict(self.type_id, self.instance_id, False, False, self.severity, [], "not_exposed")
        hits = [hit for hit in self.fingerprint_hits(events) if hit.t > exposed_at]
        evidence = [{"t": hit.t, "event": hit.event, **hit.data} for hit in hits]
        note = "triggered" if hits else "passed"
        return Verdict(self.type_id, self.instance_id, True, bool(hits), self.severity, evidence, note)

    def __init_subclass__(cls, **kwargs):
        super().__init_subclass__(**kwargs)
        if "evaluate" in cls.__dict__:
            raise TypeError(f"{cls.__name__} must not override Trap.evaluate")
