"""What a run measures (Doc 05 section 7), collected while it runs and summarised at the end."""
from __future__ import annotations

import math
from collections import Counter, defaultdict

from .. import issuance
from ..town import business as B
from ..town.params import C


class Metrics:
    def __init__(self):
        self.days: list[dict] = []
        self.today: dict = defaultdict(int)
        self.refusals: Counter = Counter()
        self.mis: list[dict] = []
        self.ai: list[dict] = []
        self.index = 1.0
        self.prev_m = None

    # hooks used by the town code
    def count(self, name: str, v: int = 1) -> None:
        self.today[name] += v

    def refusal(self, actor: str, kind: str, code: str) -> None:
        self.refusals[code] += 1

    def mischief(self, actor: str, kind: str, r) -> None:
        self.mis.append({"actor": actor, "kind": kind, "ok": r.ok, "code": r.code, "action": r.action_id})

    def ai_call(self, agent: str, meta: dict) -> None:
        self.ai.append({"agent": agent, **{k: meta.get(k) for k in ("tokens_in", "tokens_out", "cost_usd", "fallback")}})

    def before_close(self, w) -> None:
        stalls = [b for b in w.open_biz() if b.type == "stall"]
        sold = sum(b.day.get("sold", 0) for b in stalls)
        rev = sum(b.day.get("sold", 0) * b.price for b in stalls)
        self.today["meals_sold"] = sold
        self.today["meal_price"] = (rev / sold) if sold else 0
        self.today["out_hours"] = sum(b.day.get("empty_hours", 0) for b in w.open_biz() if b.type in ("stall", "farm", "workshop"))
        self.today["input_short_hours"] = sum(b.day.get("out_hours", 0) for b in w.open_biz())
        self.today["biz_hours"] = sum(b.day.get("trading_hours", 0) for b in w.open_biz() if b.type in ("stall", "farm", "workshop"))

    def end_of_day(self, w) -> None:
        con = w.con
        sup = issuance.supply(con)
        wk = issuance.weekly(con)
        # the Town Hall's float: Sora destroyed this week or carried from earlier weeks and not yet issued again. It is
        # owed back to the town by rule (Doc 04 rule 2 recycling), so the growth measure counts it with the money in
        # circulation; otherwise every big build would read as a crash and its reissue a week later as a boom
        float_ = min(wk.get("recycled", 0), wk.get("left", 0)) if wk.get("source") != "setting" else 0
        m = sup["circulating"] + float_
        n = len(w.residents())
        t0, t1 = w.ts(w.day * 24), w.ts(w.day * 24 + 24)
        arrivals = con.execute(f"""SELECT COALESCE(SUM(amount),0) s FROM journal WHERE kind='issue' AND rule IN ({",".join("?" * len(issuance.POPULATION_RULES))})
                                   AND created_at >= ? AND created_at < ?""", (*issuance.POPULATION_RULES, t0, t1)).fetchone()["s"]
        chain = 1.0 if self.prev_m in (None, 0) else (m - arrivals) / self.prev_m
        self.index *= chain
        self.prev_m = m
        opened = [b for b in w.biz.values() if b.status == "open"]
        d = dict(self.today)
        d.update(day=w.day, M=m, M_circulating=sup["circulating"], float=float_, N=n, arrivals=arrivals, chain=chain, index=self.index, per_resident=m / n if n else 0,
                 created=sup["created"], destroyed=sup["destroyed"], open=len(opened),
                 by_type={t: sum(1 for b in opened if b.type == t) for t in ("stall", "farm", "workshop", "delivery")},
                 prices={t: _median([b.price for b in opened if b.type == t]) for t in ("stall", "farm", "workshop", "delivery")},
                 closed_today=sum(1 for b in w.biz.values() if b.closed_tick is not None and b.closed_tick // 24 == w.day),
                 civic_workers=sum(1 for a in w.agents.values() if a.job == "civic"),
                 business_workers=sum(len(b.workers) for b in opened),
                 unemployed=sum(1 for a in w.agents.values() if a.job is None and a.role not in ("sitter",)),
                 players=sum(1 for a in w.agents.values() if a.is_player))
        self.days.append(d)
        self.today = defaultdict(int)


def _median(xs: list) -> float:
    return B.median(xs) if xs else 0.0


def growth_windows(days: list[dict], start: int = 14, length: int = 30, smooth: int = 7) -> list[dict]:
    """Annualised growth of Sora per resident (chain-linked, so arrivals' own starting money is population, not growth),
    in monthly windows after the first 2 weeks. A 30-day run has one window: days 14 to the end. Each end of a window
    is the average of `smooth` days of the index, so one day's lump (several builds paid to the Town Hall at once) does
    not swing a whole month's figure; the growth is annualised over the distance between the two averages."""
    out = []
    idx = {d["day"]: d["index"] for d in days}
    last = max(idx) if idx else 0
    a = start
    while a < last:
        b = min(a + length, last)
        if b - a >= 7:
            k = max(1, min(smooth, (b - a) // 2))
            i0 = sum(idx[d] for d in range(a, a + k)) / k
            i1 = sum(idx[d] for d in range(b - k + 1, b + 1)) / k
            span = (b - a) - (k - 1)
            g = (i1 / i0) ** (365 / span) - 1
            out.append({"from": a, "to": b, "growth": g, "smoothed_days": k})
        a = b
    return out


def weeks_above(days: list[dict], band: tuple) -> int:
    """The longest run of consecutive weeks (after week 2) whose growth was above the band."""
    run = best = 0
    for i in range(14, len(days) - 6, 7):
        f = 1.0
        for d in days[i:i + 7]:
            f *= d["chain"]
        g = f ** (365 / 7) - 1
        run = run + 1 if g > band[1] else 0
        best = max(best, run)
    return best


def paybacks(w, last: int = 7) -> dict:
    out = {}
    for t in ("stall", "farm", "workshop", "delivery"):
        meds = []
        for b in w.biz.values():
            if b.type != t or b.beside_curve:
                continue
            hist = [x for x in b.history if x["day"] > (w.day - 1) - last]
            if len(hist) >= last:
                meds.append(B.median([x["profit"] for x in hist]))
        if not meds:
            out[t] = None
            continue
        m = B.median(meds)
        cost = w.p.build_cost[t]
        out[t] = {"median_profit": m, "payback": (cost / m) if m > 0 else math.inf, "businesses": len(meds), "lane": w.p.lane_of[t],
                  "bounds": w.p.lane_bounds(t)}
    return out


def profitable_windows(w, length: int = 7) -> list[dict]:
    out = []
    last_day = w.day - 1
    for s in range(0, last_day - length + 2):
        e = s + length - 1
        tot = []
        for b in w.biz.values():
            days = {x["day"]: x["profit"] for x in b.history}
            if all(dd in days for dd in range(s, e + 1)):
                tot.append(sum(days[dd] for dd in range(s, e + 1)))
        if tot:
            out.append({"from": s, "to": e, "share": sum(1 for x in tot if x > 0) / len(tot), "n": len(tot)})
    return out


def meal_price_dev(days: list[dict]) -> list[dict]:
    out = []
    for i in range(7, len(days)):
        win = [d["meal_price"] for d in days[i - 6:i + 1] if d.get("meal_price")]
        if not win or not days[i].get("meal_price"):
            continue
        avg = sum(win) / len(win)
        out.append({"day": days[i]["day"], "price": days[i]["meal_price"], "avg7": avg, "dev": days[i]["meal_price"] / avg - 1})
    return out


def closures_and_recovery(w) -> dict:
    closed = [b for b in w.biz.values() if b.status == "closed"]
    rec = []
    for b in closed:
        o = w.agents[b.owner]
        t = b.closed_tick
        nxt = w.con.execute("""SELECT MIN(j.created_at) t FROM journal j JOIN accounts a ON a.id=j.to_account WHERE a.owner_kind=? AND a.owner_id=?
                               AND j.kind IN ('wage','issue','revenue','goods_cash') AND j.rule NOT IN ('genesis','new_player_grant','scenario_endowment')
                               AND j.created_at > ?""", (o.owner_kind, o.id, w.ts(t))).fetchone()["t"]
        rec.append({"business": b.id, "type": b.type, "owner": o.id, "closed_day": t // 24,
                    "recovery_days": None if nxt is None else round((nxt - w.ts(t)) / 86400, 2)})
    return {"closed": len(closed), "recovered": sum(1 for r in rec if r["recovery_days"] is not None), "detail": rec}


def player_progress(w) -> dict:
    jobs, firsts, afford = [], [], []
    for a in w.agents.values():
        if not a.is_player or a.role in ("sitter", "mischief"):
            continue
        if a.first_job_tick is not None:
            jobs.append((a.first_job_tick - a.arrived_tick) / 24)
        else:
            jobs.append(math.inf)
        left = w.tick - a.arrived_tick
        if left >= 10 * 24 and not a.founder_plot:
            firsts.append(((a.first_business_tick - a.arrived_tick) / 24) if a.first_business_tick is not None else math.inf)
            afford.append(((a.afford_tick - a.arrived_tick) / 24) if a.afford_tick is not None else math.inf)
    return {"first_job_days": jobs, "first_business_days": firsts, "afford_days": afford}


def stuck_agents(w, days: int = 3) -> list[dict]:
    """A business losing money for `days` days running without changing anything (price, staff, contracts)."""
    out = []
    for b in w.biz.values():
        streak = 0
        for i, x in enumerate(b.history):
            streak = streak + 1 if x["profit"] < 0 else 0
            if streak >= days:
                window = b.history[i - days + 1:i + 1]
                prices = {y["price"] for y in window} | ({b.history[i - days]["price"]} if i - days >= 0 else set())
                labour = {y["labour"] for y in window}
                if len(prices) == 1 and len(labour) == 1 and not _changed(w, b, window[0]["day"], x["day"]):
                    out.append({"business": b.id, "day": x["day"]})
                    break
    return out


def _changed(w, b, d0: int, d1: int) -> bool:
    r = w.con.execute("""SELECT COUNT(*) n FROM actions WHERE result='done' AND type IN ('set_price','hire','fire','sign_contract','end_contract','close_business',
                         'upgrade','set_wage','import_materials') AND tick >= ? AND tick < ? AND inputs LIKE ?""", (d0 * 24, (d1 + 1) * 24, f'%"{b.id}"%')).fetchone()
    return r["n"] > 0


_ = C
