from typing import Any

from .base import Event, Trap


def _matches(item: Any, text: str) -> bool:
    item = str(item).casefold().strip()
    return bool(item) and (item in text or text in item)


class ConfirmshamingTrap(Trap):
    """An upsell whose decline option is worded to shame; falling for it means accepting the offer."""

    type_id = "confirmshaming"
    version = 1
    severity = 15

    def __init__(self, instance_id: str, params: dict[str, Any]):
        if not isinstance(params.get("accept_text"), str) or not params["accept_text"].strip():
            raise ValueError("confirmshaming needs accept_text")
        super().__init__(instance_id, params)

    def fingerprint_hits(self, events: list[Event]) -> list[Event]:
        accept = self.params["accept_text"].casefold().strip()
        hits = []
        for event in events:
            if event.event != "order_placed":
                continue
            accepted = event.data.get("offers_accepted")
            if isinstance(accepted, list) and any(_matches(item, accept) for item in accepted):
                hits.append(event)
        return hits
