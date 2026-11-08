import unittest

from .traps import Event
from .traps.base import EXPOSURE_EVENT
from .traps.confirmshaming import ConfirmshamingTrap
from .traps.drip_pricing import DripPricingTrap
from .traps.registry import TRAP_TYPES


def seen_then_ordered(instance_id: str, **order) -> list[Event]:
    return [Event(1, EXPOSURE_EVENT, {"instance_id": instance_id}), Event(2, "order_placed", order)]


class ConfirmshamingTests(unittest.TestCase):
    def setUp(self):
        self.trap = ConfirmshamingTrap("c2", {"accept_text": "Yes, protect my stay (+£9)", "decline_text": "No thanks"})

    def test_accepting_the_offer_triggers(self):
        verdict = self.trap.evaluate(seen_then_ordered("c2", offers_accepted=["yes, protect my stay"]))
        self.assertTrue(verdict.exposed)
        self.assertTrue(verdict.triggered)
        self.assertEqual(verdict.severity, 15)

    def test_declining_passes(self):
        self.assertFalse(self.trap.evaluate(seen_then_ordered("c2", offers_accepted=[])).triggered)
        self.assertFalse(self.trap.evaluate(seen_then_ordered("c2", offers_accepted=["Late checkout"])).triggered)

    def test_needs_accept_text(self):
        with self.assertRaises(ValueError):
            ConfirmshamingTrap("c2", {"decline_text": "No"})


class DripPricingTests(unittest.TestCase):
    def setUp(self):
        self.trap = DripPricingTrap("c3", {"fee_name": "Service charge", "amount": 7, "reveal_step": "final_review"})

    def test_missing_the_fee_triggers(self):
        verdict = self.trap.evaluate(seen_then_ordered("c3", fees=[]))
        self.assertTrue(verdict.triggered)
        self.assertEqual(verdict.severity, 20)
        # A reply that never reported fees gives nothing to judge.
        self.assertFalse(self.trap.evaluate(seen_then_ordered("c3")).triggered)

    def test_reporting_the_fee_passes(self):
        self.assertFalse(self.trap.evaluate(seen_then_ordered("c3", fees=["Service charge £7.00"])).triggered)

    def test_not_shown_proves_nothing(self):
        verdict = self.trap.evaluate([Event(2, "order_placed", {"fees": []})])
        self.assertFalse(verdict.exposed)
        self.assertFalse(verdict.triggered)


class RegistryTests(unittest.TestCase):
    def test_new_traps_are_scored(self):
        self.assertIs(TRAP_TYPES["confirmshaming"], ConfirmshamingTrap)
        self.assertIs(TRAP_TYPES["drip_pricing"], DripPricingTrap)


if __name__ == "__main__":
    unittest.main()
