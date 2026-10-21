"""World: the clock, plots, residents, businesses and seeded random numbers (Doc 05 section 2). It never moves money by
itself: the money helpers here call the Ledger, and every decision reaches them only through the Actions gate.

The same seed gives the same run: one `random.Random` per subsystem, seeded from the run seed and a fixed name; every
loop walks agents and businesses in id order; the clock is the seeded tick, never the wall clock (`db.clock`).
"""
from __future__ import annotations

import calendar
import json
import math
import random
import sqlite3
from dataclasses import dataclass, field

from .. import db, ledger
from . import events, goods
from .params import C, Params

EPOCH = calendar.timegm((2027, 1, 4, 0, 0, 0))  # a Monday, so simulated weeks line up with the Town Hall's budget weeks
WORK_HOURS = range(8, 20)  # 12 working hours
MEAL_HOURS = (12, 18)
CIVIC = "civic"


@dataclass
class Agent:
    id: str
    kind: str            # house | player
    role: str            # resident | business | entrepreneur | player | sitter | mischief
    owner_kind: str      # agent (house) | human (a person's own account)
    owner_key: str
    home: tuple
    personality: dict
    limits: dict
    arrived_tick: int
    mode: str = "rules"
    job: str | None = None          # employer business id, CIVIC, or 'own:<biz>'
    wage: int = 0
    hours: dict = field(default_factory=dict)  # employer -> hours worked today
    businesses: list = field(default_factory=list)
    founder_plot: str | None = None
    first_job_tick: int | None = None
    first_business_tick: int | None = None
    afford_tick: int | None = None
    spent_today: int = 0
    hungry: int = 0
    meals_today: int = 0
    pending_approval: list = field(default_factory=list)
    last_paid_tick: int | None = None
    closed_at: list = field(default_factory=list)   # ticks when one of its businesses closed (recovery is measured from them)
    decor: int = 0

    @property
    def acct(self) -> tuple[str, str]:
        return (self.owner_kind, self.id)

    @property
    def holder(self) -> str:
        return f"{self.owner_kind}:{self.id}"

    @property
    def is_player(self) -> bool:
        return self.kind == "player"


@dataclass
class Biz:
    id: str
    type: str
    plot: str
    owner: str
    xy: tuple
    price: int
    wage: int
    cost: int
    opened_tick: int
    level: int = 1
    status: str = "open"
    rating: float = 1.0
    workers: list = field(default_factory=list)   # hired agent ids
    owner_works: bool = True
    mode: str = "rules"
    acc: dict = field(default_factory=dict)       # fractional production carried between hours
    since_tool: int = 0                           # farm: crops made since the last tool wore out
    ema_demand: float = 0.0                       # units a day it expects to sell
    day: dict = field(default_factory=dict)       # today's counters
    history: list = field(default_factory=list)   # one dict per finished day
    loss_streak: int = 0
    last_change_day: int = 0
    loads_today: int = 0
    closed_tick: int | None = None
    beside_curve: bool = False
    out_hours: int = 0

    @property
    def acct(self) -> tuple[str, str]:
        return ("company", self.id)

    @property
    def holder(self) -> str:
        return f"company:{self.id}"

    def labour(self, w: "World") -> int:
        own = 1 if self.owner_works and w.agents[self.owner].job == f"own:{self.id}" else 0
        return own + len(self.workers)

    def max_hires(self, p: Params) -> int:
        return p.hires_level1 + (self.level - 1) * p.hires_per_level


class World:
    def __init__(self, con: sqlite3.Connection, p: Params, seed: int, *, mode: str = "rules", scenario=None, planner=None):
        self.con, self.p, self.seed, self.mode, self.scenario, self.planner = con, p, seed, mode, scenario, planner
        self.tick = 0
        self._seq = 0
        self.rng = {name: random.Random(f"{seed}:{name}") for name in ("genesis", "meals", "agents", "scenario", "market", "ai")}
        self.agents: dict[str, Agent] = {}
        self.biz: dict[str, Biz] = {}
        self.plots: dict[str, dict] = {}
        self._acct: dict[tuple, int] = {}
        self.mod = {"farm_output": 1.0, "material_price": 1.0}
        self.players_online = True
        self.metrics = None  # set by the runner (sim.metrics.Metrics)
        self.flags: dict = {"civic_shortfall_days": 0}
        self.ai_missing = 0
        self.floor_offers: list = []
        self.signals: dict = {"room": {t: False for t in ("stall", "farm", "workshop", "delivery")},
                              "crowd": {t: "balanced" for t in ("stall", "farm", "workshop", "delivery")}}
        self.ai_budget: dict = {}
        self._today_events = None

    # ------------------------------------------------------------------ clock and ids
    def ts(self, tick: int | None = None) -> float:
        return float(EPOCH + (self.tick if tick is None else tick) * 3600)

    @property
    def day(self) -> int:
        return self.tick // 24

    @property
    def hour(self) -> int:
        return self.tick % 24

    def seq(self) -> int:
        self._seq += 1
        return self._seq

    def key(self, what: str) -> str:
        return f"{what}:{self.tick}:{self.seq()}"

    def today_events(self) -> list:
        return self.con.execute("SELECT * FROM world_events WHERE tick >= ? ORDER BY seq", (self.day * 24,)).fetchall()

    # ------------------------------------------------------------------ money (always through the Ledger)
    def acct_id(self, kind: str, oid: str, key: str = "") -> int:
        k = (kind, oid)
        if k not in self._acct:
            self._acct[k] = ledger.account(self.con, kind, oid, db.SORA, key)["id"]
        return self._acct[k]

    def owner_key_of(self, acct: tuple[str, str]) -> str:
        kind, oid = acct
        if kind == "company":
            return self.agents[self.biz[oid].owner].owner_key
        if kind == "platform":
            return "platform"
        return self.agents[oid].owner_key

    def bal(self, acct: tuple[str, str]) -> int:
        aid = self.acct_id(acct[0], acct[1], self.owner_key_of(acct))
        return self.con.execute("SELECT available FROM accounts WHERE id=?", (aid,)).fetchone()["available"]

    def pay(self, src: tuple[str, str], dst: tuple[str, str], amount: int, *, kind: str, rule: str, ref_type: str = "", ref_id: str = "") -> int:
        if amount <= 0:
            return 0
        s = self.acct_id(src[0], src[1], self.owner_key_of(src))
        d = self.acct_id(dst[0], dst[1], self.owner_key_of(dst))
        return ledger.transfer(self.con, kind=kind, idem_key=self.key(rule), src=s, src_bucket="available", dst=d, dst_bucket="available",
                               asset=db.SORA, amount=amount, txn_id=f"t{self.tick}", ref_type=ref_type, ref_id=ref_id, rule=rule)

    def issue(self, mint: tuple[str, str], dst: tuple[str, str], amount: int, *, rule: str, ref_type: str = "", ref_id: str = "") -> int:
        if amount <= 0:
            return 0
        return ledger.issue(self.con, dst[1], amount, idem_key=self.key(rule), rule=rule, ref_type=ref_type, ref_id=ref_id,
                            owner_key=self.owner_key_of(dst), owner_kind=dst[0], mint=mint, txn_id=f"t{self.tick}")

    def sink(self, src: tuple[str, str], mint: tuple[str, str], amount: int, *, rule: str, ref_type: str = "", ref_id: str = "") -> int:
        """Pay into a mint: the coins are destroyed (imports at the Harbour; plots, building, upkeep and decor at the Town Hall)."""
        return self.pay(src, mint, amount, kind="sink", rule=rule, ref_type=ref_type, ref_id=ref_id)

    # ------------------------------------------------------------------ events
    def event(self, kind: str, who: list[str], text: str, *, visibility: str = "town", refs: dict | None = None) -> str:
        return events.emit(self.con, seq=self.seq(), tick=self.tick, kind=kind, who=who, visibility=visibility, refs=refs or {}, text=text)

    # ------------------------------------------------------------------ people and jobs
    def residents(self) -> list[Agent]:
        return [a for a in self.agents.values() if a.role != "mischief"]

    def set_job(self, a: Agent, employer: str | None, wage: int = 0) -> None:
        if a.job == employer:
            return
        if a.job and not a.job.startswith("own:"):
            self.con.execute("UPDATE jobs SET end_tick=? WHERE worker=? AND end_tick IS NULL", (self.tick, a.id))
            if a.job in self.biz and a.id in self.biz[a.job].workers:
                self.biz[a.job].workers.remove(a.id)
        a.job, a.wage = employer, wage
        if employer and a.first_job_tick is None:
            a.first_job_tick = self.tick  # working in one's own business counts as a job
        if employer and not employer.startswith("own:"):
            self.con.execute("INSERT INTO jobs(employer, worker, wage, start_tick) VALUES (?,?,?,?)", (employer, a.id, wage, self.tick))
            if employer in self.biz:
                self.biz[employer].workers.append(a.id)
            if a.first_job_tick is None:
                a.first_job_tick = self.tick

    def dist(self, a: tuple, b: tuple) -> float:
        return math.hypot(a[0] - b[0], a[1] - b[1])

    # ------------------------------------------------------------------ records
    def save_agent(self, a: Agent) -> None:
        self.con.execute("""INSERT INTO town_agents(id, kind, role, owner_kind, owner_key, personality, limits, mode, ai_budget_left, arrived_tick, home)
                            VALUES (?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET role=excluded.role, mode=excluded.mode""",
                         (a.id, a.kind, a.role, a.owner_kind, a.owner_key, json.dumps(a.personality, sort_keys=True), json.dumps(a.limits, sort_keys=True),
                          a.mode, 0, a.arrived_tick, json.dumps(a.home)))

    def save_biz(self, b: Biz) -> None:
        self.con.execute("""INSERT INTO businesses(id, type, plot, owner, price, wage, level, health, status, cost, rating, opened_tick, closed_tick, beside_curve)
                            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET owner=excluded.owner, price=excluded.price, wage=excluded.wage,
                            level=excluded.level, health=excluded.health, status=excluded.status, rating=excluded.rating, closed_tick=excluded.closed_tick""",
                         (b.id, b.type, b.plot, b.owner, b.price, b.wage, b.level, health(b), b.status, b.cost, round(b.rating, 4), b.opened_tick,
                          b.closed_tick, int(b.beside_curve)))

    def set_state(self, key: str, value) -> None:
        self.con.execute("INSERT INTO town_state(key, value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", (key, json.dumps(value)))

    def open_biz(self) -> list[Biz]:
        return [b for b in self.biz.values() if b.status == "open"]

    def ref_price(self, good: str) -> int:
        p = self.p
        return {"crops": p.crop_ref, "tools": p.tool_ref, "materials": self.material_price(), "meals": p.meal_ref}[good]

    def material_price(self) -> int:
        return int(round(self.p.material_price * self.mod["material_price"]))

    def stock(self, holder: str, good: str) -> int:
        return goods.get(self.con, holder, good)[0]


def health(b: Biz) -> str:
    if b.status != "open":
        return "grey"
    last = [d["profit"] for d in b.history[-7:]]
    if not last:
        return "green"
    s = sum(last)
    return "green" if s > 0 and b.loss_streak < 2 else "amber" if s > -50 * C else "red"
