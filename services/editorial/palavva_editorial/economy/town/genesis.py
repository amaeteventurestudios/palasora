"""Genesis (day 0) and arrivals (Doc 05 section 6).

The same for every scenario: 120 plots; 100 house agents (70 residents, 20 business agents running the first 20
businesses, 10 entrepreneurs); starting balances from the Town Hall (100 Sora per resident, 200 working capital per
business, 300 per entrepreneur), every coin recorded as Town Hall issuance with rule `genesis`; starting stock of 3 days
of crops and tools; the civic job always open. Players arrive on top: each gets the new player's grant, or, with a
Founder Pass, a prime plot and no coins (Doc 04 section 4).
"""
from __future__ import annotations

import math

from . import business as B, civic, goods, layout
from .params import C
from .world import Agent, World

HOUSE_LIMITS = {"daily_cap": 5_000 * C, "price_range": (0.6, 1.6), "approval": []}
PLAYER_LIMITS = {"daily_cap": 600 * C, "price_range": (0.6, 1.6), "approval": ["build", "buy_plot", "sell_plot", "close_business", "buy_business",
                                                                              "transfer_shares", "upgrade"]}


def plots(w: World) -> None:
    for r in layout.layout():
        w.plots[r["id"]] = r
        w.con.execute("INSERT INTO plots(id, area, x, y, size, prime, use) VALUES (?,?,?,?,1,?,?)", (r["id"], r["area"], r["x"], r["y"], r["prime"], r["use"]))


def _home(w: World, i: int) -> tuple:
    homes = [p for p in w.plots.values() if p["use"] == "home"]
    h = homes[i % len(homes)]
    rng = w.rng["genesis"]
    return (round(h["x"] + rng.uniform(-0.4, 0.4), 2), round(h["y"] + rng.uniform(-0.4, 0.4), 2))


def house_agent(w: World, i: int, role: str) -> Agent:
    aid = f"h{i:03d}"
    rng = w.rng["genesis"]
    a = Agent(id=aid, kind="house", role=role, owner_kind="agent", owner_key=f"seed:{aid}", home=_home(w, i),
              personality={"boldness": round(rng.random(), 3), "thrift": round(rng.random(), 3)}, limits=dict(HOUSE_LIMITS), arrived_tick=0)
    w.agents[aid] = a
    w.save_agent(a)
    return a


def genesis(w: World) -> None:
    p = w.p
    civic.setup(w)
    plots(w)
    n = 0
    for _ in range(p.house_residents):
        n += 1
        a = house_agent(w, n, "resident")
        civic.population_issue(w, a, p.start_resident, "genesis")
    owners = []
    for _ in range(p.house_business_agents):
        n += 1
        a = house_agent(w, n, "business")
        civic.population_issue(w, a, p.start_resident, "genesis")
        owners.append(a)
    for _ in range(p.house_entrepreneurs):
        n += 1
        a = house_agent(w, n, "entrepreneur")
        civic.population_issue(w, a, p.start_entrepreneur, "genesis")
    rng = w.rng["genesis"]
    free = {area: [pl["id"] for pl in w.plots.values() if pl["use"] == "business" and pl["area"] == area] for area in ("market", "farmland", "harbourside", "main")}
    for v in free.values():
        rng.shuffle(v)
    want = {"stall": "market", "farm": "farmland", "workshop": "harbourside", "delivery": "main"}
    order = [t for t in ("stall", "farm", "workshop", "delivery") for _ in range(p.genesis_mix[t])]
    residents = p.house_residents + p.house_business_agents + p.house_entrepreneurs
    for a, btype in zip(owners, order):
        plot_id = free[want[btype]].pop()
        b = _genesis_biz(w, a, btype, plot_id)
        civic.population_issue(w, b, p.start_business, "genesis")
        _starting_stock(w, b, residents)


def _genesis_biz(w: World, a: Agent, btype: str, plot_id: str):
    """The first businesses stand at day 0. Their owners built them at genesis: the build cost is part of the owner's
    genesis money and is paid to the Town Hall at once (a sink like any build), which gives the Town Hall the recycled
    Sora it pays the first civic wages from instead of starting the town with an empty purse."""
    p = w.p
    pl = w.plots[plot_id]
    bid = f"b{len(w.biz) + 1:03d}"
    price = p.type_ref(btype)
    b = B.Biz(id=bid, type=btype, plot=plot_id, owner=a.id, xy=(pl["x"], pl["y"]), price=price, wage=p.wage_ref, cost=p.build_cost[btype], opened_tick=0)
    if w.mode in ("recorded", "live") and int(bid[1:]) % 2 == 0:
        b.mode = w.mode  # Gate B: in an AI run every second house business is AI-planned, the rest stay on rules
    B.new_day(b)
    w.biz[bid] = b
    pl.update(owner=a.id, building=btype, level=1)
    w.con.execute("UPDATE plots SET owner=?, building=?, level=1 WHERE id=?", (a.id, btype, plot_id))
    a.businesses.append(bid)
    a.first_business_tick = 0
    w.save_biz(b)
    B.mint_shares(w, b, a)
    w.issue(civic.TOWN_HALL, a.acct, b.cost, rule="genesis", ref_type="business", ref_id=bid)
    w.sink(a.acct, civic.TOWN_HALL, b.cost, rule="build", ref_type="business", ref_id=bid)
    w.set_job(a, f"own:{bid}")
    return b


def _starting_stock(w: World, b, residents: int) -> None:
    p, days = w.p, p_days(w)
    mix = p.genesis_mix
    meals_day = residents * p.meals_per_day
    if b.type == "stall":
        b.ema_demand = meals_day / mix["stall"]
        goods.create(w.con, 0, b.holder, "crops", int(b.ema_demand * days), "made", "genesis", b.id)
    elif b.type == "farm":
        b.ema_demand = meals_day / mix["farm"]
        goods.create(w.con, 0, b.holder, "tools", max(2, math.ceil(p.farm_crops_per_worker * days / p.crops_per_tool)), "made", "genesis", b.id)
        goods.create(w.con, 0, b.holder, "crops", int(b.ema_demand), "made", "genesis", b.id)
    elif b.type == "workshop":
        tools_day = meals_day / p.crops_per_tool
        b.ema_demand = max(1.0, tools_day / mix["workshop"])
        goods.create(w.con, 0, b.holder, "materials", max(4, math.ceil(b.ema_demand * days)), "made", "genesis", b.id)
        goods.create(w.con, 0, b.holder, "tools", max(2, math.ceil(b.ema_demand)), "made", "genesis", b.id)
    else:
        b.ema_demand = 6.0


def p_days(w: World) -> int:
    return w.p.starting_stock_days


def arrive_player(w: World, pid: str, *, founder: bool = False, endowment: int = 0, role: str = "player", label: str = "") -> Agent:
    p = w.p
    i = len(w.agents) + 1
    a = Agent(id=pid, kind="player", role=role, owner_kind="human", owner_key=f"user:{pid}", home=_home(w, i),
              personality={"boldness": round(w.rng["genesis"].random(), 3)}, limits=dict(PLAYER_LIMITS), arrived_tick=w.tick,
              mode=w.mode if w.mode in ("recorded", "live") else "rules")
    w.agents[pid] = a
    w.save_agent(a)
    if founder:
        prime = sorted((pl for pl in w.plots.values() if pl["use"] == "business" and pl["prime"] and not pl["owner"]), key=lambda pl: pl["id"])
        if prime:
            a.founder_plot = prime[0]["id"]
            prime[0]["owner"] = pid
            w.con.execute("UPDATE plots SET owner=? WHERE id=?", (pid, prime[0]["id"]))
    else:
        civic.population_issue(w, a, p.grant_new_player, "new_player_grant")
    civic.queue_starter_grant(w, a)
    if endowment:
        civic.population_issue(w, a, endowment, "scenario_endowment")
        w.flags.setdefault("endowed", []).append(pid)  # starts with money, so not on the worker path (Gate A first business)
    w.event("player_arrived", [pid], f"{pid} arrived in town{' with a Founder Pass' if founder else ''}{label}", visibility="public",
            refs={"agent": pid, "founder_plot": a.founder_plot or ""})
    return a
