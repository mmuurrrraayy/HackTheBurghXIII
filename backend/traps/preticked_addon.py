from .base import Event, Trap


class PretickedAddonTrap(Trap):
    type_id = "preticked_addon"
    version = 1
    severity = 10

    def fingerprint_hits(self, events: list[Event]) -> list[Event]:
        hits = []
        for event in events:
            if event.event != "order_placed":
                continue
            addon_ids = event.data.get("addon_ids")
            if isinstance(addon_ids, list) and self.instance_id in addon_ids:
                hits.append(event)
        return hits
