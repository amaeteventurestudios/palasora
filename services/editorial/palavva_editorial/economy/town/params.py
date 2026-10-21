"""Every number the town economy uses, in one place (Doc 04 sections 2, 3 and 4A; Doc 05 section 12).

Money is in centi-Sora (1 Sora = 100), like the ledger. `DOC04` keeps the starting values from Document 04 v0.5 so the
run report can show what the simulation changed and why (Doc 05 section 9 step 4: tune the numbers until every gate
passes; the gates themselves never change). A scenario may override any field (for example the Harbour floor tests at
40% and 80%).
"""
from __future__ import annotations

from dataclasses import asdict, dataclass, field, replace

C = 100  # centi-Sora per Sora

TYPES = ("farm", "workshop", "stall", "delivery")
GOODS = ("crops", "meals", "tools", "materials")


@dataclass(frozen=True)
class Params:
    # -- Doc 04 section 3: starting values ---------------------------------------------------------------------------
    grant_new_player: int = 200 * C
    starter_grant: int = 80 * C    # once per person, from the Town Hall's weekly budget (owner decision, Phase 3 review)
    starter_grant_after_days: int = 5  # paid at the end of a new player's first working week, not on arrival
    meal_ref: int = 5 * C
    crop_ref: int = 150            # 1.50 Sora
    tool_ref: int = 20 * C
    material_price: int = 8 * C    # fixed by the Harbour
    wage_ref: int = 25 * C         # a day
    delivery_fee: int = 3 * C      # a load
    load_size: int = 20            # units a load
    plot_upkeep: int = 2 * C       # a day, per business plot
    civic_wage: int = 20 * C       # a day, Town Hall, always open
    start_resident: int = 100 * C
    start_business: int = 200 * C
    start_entrepreneur: int = 300 * C
    hires_level1: int = 2          # owner plus up to 2 at level 1
    hires_per_level: int = 2
    # -- Doc 04 section 2: goods and the four businesses ---------------------------------------------------------------
    build_cost: dict = field(default_factory=lambda: {"farm": 400 * C, "workshop": 500 * C, "stall": 300 * C, "delivery": 250 * C})
    plot_share: int = 50 * C       # part of the build cost paid for the plot (the rest is construction); both go to the Town Hall
    farm_crops_per_worker: int = 40
    crops_per_tool: int = 100      # tool wear: 1 tool per 100 crops
    workshop_tools_per_worker: int = 8   # Doc 04 gives no rate ("1 material plus work makes 1 tool")
    stall_meals_per_worker: int = 60
    delivery_loads_per_worker: int = 6   # a cart does a 2-hour trip; 12 working hours
    trip_hours: int = 2
    self_fetch_hours: int = 6      # an owner can fetch goods themselves, slowly
    meals_per_day: int = 2
    # -- Doc 04 section 4 and Doc 05 section 12: the Harbour -------------------------------------------------------------
    floor_pct: float = 0.60        # buys surplus at 60% of the reference price
    floor_daily_cap_units: dict = field(default_factory=lambda: {"crops": 60, "tools": 4})  # per seller per day
    # -- Doc 04 section 4A ---------------------------------------------------------------------------------------------
    growth_target: float = 0.20
    growth_band: tuple = (0.15, 0.25)
    lanes: dict = field(default_factory=lambda: {"tight": (4.0, 10.0), "shared": (4.0, 10.0), "money": (15.0, 40.0)})
    lane_of: dict = field(default_factory=lambda: {"stall": "tight", "delivery": "tight", "farm": "shared", "workshop": "shared"})
    savings_interest: float = 0.0  # Rule 3: none in v0.1
    rent: bool = False             # default: no rent yet
    max_businesses_per_player: int = 3  # default before the Exchange opens
    # -- behaviour (rules agents) ----------------------------------------------------------------------------------------
    price_step: float = 0.04       # a stall or seller moves its price by at most 4% a day
    price_range: tuple = (0.6, 1.6)   # owner's default price range, x reference
    decor_share: float = 0.25      # share of cash above comfort spent on decor (cosmetics, a sink) each evening
    decor_comfort: dict = field(default_factory=lambda: {"worker": 150 * C, "owner": 300 * C})
    working_capital_days: float = 3.0
    close_loss_days: int = 5
    contract_days: int = 7
    # -- AI budget (Doc 05 section 12): free players --------------------------------------------------------------------
    ai_plans_per_day: int = 1
    ai_event_calls_per_day: int = 3
    # -- genesis (Doc 05 section 6) --------------------------------------------------------------------------------------
    plots: int = 120
    house_residents: int = 70
    house_business_agents: int = 20
    house_entrepreneurs: int = 10
    genesis_mix: dict = field(default_factory=lambda: {"stall": 7, "farm": 6, "workshop": 3, "delivery": 4})
    starting_stock_days: int = 3

    def with_(self, **kw) -> "Params":
        return replace(self, **kw)

    def lane_bounds(self, btype: str) -> tuple[float, float]:
        """The lane for a business type, widened by half a lane either side (Doc 05 Gate A)."""
        lo, hi = self.lanes[self.lane_of[btype]]
        half = (hi - lo) / 2
        return max(0.0, lo - half), hi + half

    def as_dict(self) -> dict:
        return asdict(self)


DOC04 = Params()


def tuned() -> Params:
    """The numbers the simulation runs with. Changes from Document 04 are listed in TUNING with the reason."""
    return DOC04.with_(**{k: v for k, (v, _why) in TUNING.items()})


# name -> (tuned value, why). Filled in by the tuning runs; every gate runs again after any change.
TUNING: dict = {
    "crop_ref": (200, "1.50 left farms below their lane: a farm worker's 40 crops a day earned less than a civic wage"),
    "crops_per_tool": (40, "at 1 tool per 100 crops the town needed under 3 tools a day, too few for even one workshop to pay back"),
    "load_size": (10, "with 20-unit loads the town's whole trade filled under two carts, so delivery could not reach its lane"),
    "delivery_fee": (6 * C, "with smaller loads, 6 Sora a load keeps a one-person cart near a 3-day payback without doubling stall costs"),
    "build_cost": ({"farm": 400 * C, "workshop": 500 * C, "stall": 200 * C, "delivery": 100 * C},
                   "a cart earning about 30 Sora a day pays back 100 Sora in about 3 days (tight lane); 250 took 8 or more. A stall at "
                   "200 sits mid tight lane at the town's meal demand, and a new player can save it plus a starting float for crops "
                   "within 5 to 10 days on a civic wage"),
    "decor_comfort": ({"worker": 60 * C, "owner": 120 * C}, "decor is the town's main sink; at 150 and 300 Sora most coins sat idle and the Town Hall "
                      "had too little recycled Sora to pay civic wages"),
    "decor_share": (0.3, "spends a little faster above comfort so recycled Sora returns to the Town Hall within days"),
    "working_capital_days": (1.5, "three days of costs held in every business tied up a fifth of the money supply"),
    "genesis_mix": ({"stall": 5, "farm": 3, "workshop": 1, "delivery": 2},
                    "the town's demand (2 meals a resident a day) supports about this many at their lanes; 7/6/3/4 left every trade crowded"),
}
