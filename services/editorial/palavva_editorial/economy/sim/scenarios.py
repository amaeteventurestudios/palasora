"""The ten scenarios (Doc 04 section 9; Doc 05 section 6). Each is the baseline plus its change.

Default recorded in the Phase 3 PR: every scenario includes the same small trickle of players (one a day on days 1 to
10, at 09:00), because Doc 04 section 1 has players joining on top of the house agents and several gates (first job,
first business, morning reports, quiet spell) are about players. The Baseline is that and nothing else.
"""
from __future__ import annotations

from ..town import business as B, genesis
from ..town.params import C

DOC = {
    "baseline": "Baseline: 100 house agents (plus the player trickle)",
    "drought": "Drought: farm output halves on days 8 to 14",
    "rush": "Rush: 10 new food stalls open on day 10",
    "rich_arrivals": "Rich arrivals: 20 Founder Pass players on day 5 (a prime plot each, no coins)",
    "cheater": "Cheater: a mischief agent tries self-trades, over-limit spending and fake goods",
    "quiet_spell": "Quiet spell: all players silent on days 15 to 17",
    "growth": "Growth: 500 players join over 2 weeks",
    "job_squeeze": "Job squeeze: 50 players join on one day (day 10)",
    "price_shock": "Price shock: material import prices rise 50% on days 10 to 16",
    "sitter": "Sitter: one agent holds 2,000 Sora and does nothing; another runs a business with the same money",
}
ORDER = list(DOC)
GATE_A = ("baseline", "drought", "rush", "cheater", "quiet_spell", "job_squeeze", "price_shock", "sitter")


class Scenario:
    name = "baseline"

    def __init__(self, days: int = 30):
        self.days = days
        self.players = 0

    def on_tick(self, w) -> None:
        if w.hour == 9 and 1 <= w.day <= 10:
            self.new_player(w)
        self.extra(w)

    def extra(self, w) -> None:
        pass

    def new_player(self, w, **kw):
        self.players += 1
        while f"p{self.players:03d}" in w.agents:  # a person who moved in (step 3) already took this id
            self.players += 1
        return genesis.arrive_player(w, f"p{self.players:03d}", **kw)


class Baseline(Scenario):
    name = "baseline"


class Drought(Scenario):
    name = "drought"

    def extra(self, w):
        if w.hour == 0:
            w.mod["farm_output"] = 0.5 if 8 <= w.day <= 14 else 1.0
            if w.day == 8:
                w.event("drought_started", ["town_hall"], "Drought: farm output halves for a week", visibility="public")


class Rush(Scenario):
    name = "rush"

    def extra(self, w):
        if w.day == 10 and w.hour == 8:
            from ..town import actions
            # the ten richest house residents without a business (players keep to their own worker path)
            rich = sorted((a for a in w.agents.values() if a.kind == "house" and not any(w.biz[b].status == "open" for b in a.businesses)),
                          key=lambda a: (-w.bal(a.acct), a.id))
            opened = 0
            for a in rich:
                if opened >= 10:
                    break
                if w.bal(a.acct) >= w.p.build_cost["stall"]:
                    r = actions.submit(w, a.id, "build", via="agent", btype="stall")
                    opened += r.ok
            w.event("rush", ["town_hall"], f"Rush: {opened} new food stalls opened today", visibility="public")


class RichArrivals(Scenario):
    name = "rich_arrivals"

    def extra(self, w):
        if w.day == 5 and w.hour == 9:
            for _ in range(20):
                self.new_player(w, founder=True)


class Cheater(Scenario):
    name = "cheater"

    def extra(self, w):
        if w.day == 0 and w.hour == 1:
            a = genesis.arrive_player(w, "x001", endowment=600 * C, role="mischief", label=" (the Cheater scenario's mischief agent)")
            from ..town import actions
            actions.submit(w, a.id, "build", via="agent", btype="farm")


class QuietSpell(Scenario):
    name = "quiet_spell"

    def extra(self, w):
        if w.hour == 0:
            w.players_online = not (15 <= w.day <= 17)


class Growth(Scenario):
    name = "growth"

    def extra(self, w):
        # 500 players over days 1 to 14: 36 a day (35 on the last day), spread over the working hours
        if 1 <= w.day <= 14 and 8 <= w.hour <= 19:
            per_day = 36 if w.day < 14 else 500 - 36 * 13
            k = per_day // 12 + (1 if (w.hour - 8) < per_day % 12 else 0)
            for _ in range(k):
                self.new_player(w)


class JobSqueeze(Scenario):
    name = "job_squeeze"

    def extra(self, w):
        if w.day == 10 and w.hour == 9:
            for _ in range(50):
                self.new_player(w)


class PriceShock(Scenario):
    name = "price_shock"

    def extra(self, w):
        if w.hour == 0:
            w.mod["material_price"] = 1.5 if 10 <= w.day <= 16 else 1.0
            if w.day == 10:
                w.event("price_shock", ["harbour"], "Material import prices rise 50% for a week", visibility="public")


class Sitter(Scenario):
    name = "sitter"

    def extra(self, w):
        if w.day == 1 and w.hour == 8:
            genesis.arrive_player(w, "s001", endowment=2000 * C, role="sitter", label=" (holds 2,000 Sora and does nothing)")
            r = genesis.arrive_player(w, "s002", endowment=2000 * C, role="player", label=" (runs a business with the same money)")
            from ..town import actions
            actions.submit(w, r.id, "build", via="agent", btype="stall")


CLASSES = {c.name: c for c in (Baseline, Drought, Rush, RichArrivals, Cheater, QuietSpell, Growth, JobSqueeze, PriceShock, Sitter)}


def make(name: str, days: int = 30) -> Scenario:
    return CLASSES[name](days)


_ = B
