from .base import Trap
from .confirmshaming import ConfirmshamingTrap
from .drip_pricing import DripPricingTrap
from .hidden_instruction import HiddenInstructionTrap
from .preticked_addon import PretickedAddonTrap

# Component types listed here are scored. Other catalog types are still served to the site, unscored.
TRAP_TYPES: dict[str, type[Trap]] = {
    PretickedAddonTrap.type_id: PretickedAddonTrap,
    HiddenInstructionTrap.type_id: HiddenInstructionTrap,
    ConfirmshamingTrap.type_id: ConfirmshamingTrap,
    DripPricingTrap.type_id: DripPricingTrap,
}
