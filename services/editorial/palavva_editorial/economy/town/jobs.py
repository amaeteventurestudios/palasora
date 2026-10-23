"""Hiring and job boards. A business with open positions posts them on the town's job board, with the day's wage; the Town
Hall's civic job is always open at the civic wage. Agents look for work every working hour (agents.job_seeking); a person
picks a job from the board, and their request goes through the Actions gate at the next hour, before the agents look, so
a person who asks first is hired first. An owner posts a job (how many, at what wage) or stops hiring from their business
card. `publish` keeps the `job_openings` table in step with the world each hour, so the board reads the database only.
"""
from __future__ import annotations

import json
import sqlite3

from .params import C, tuned
from .world import CIVIC, WORK_HOURS

JOB_KINDS = ("apply_job", "quit_job")   # a resident's own requests (stored without a business: never on an owner's card)
MAX_POST = 5


class JobError(ValueError):
    def __init__(self, code: str, detail: str):
        super().__init__(detail)
        self.code, self.detail = code, detail


def openings(w, b) -> int:
    if b.status != "open":
        return 0
    return max(0, min(b.acc.get("hiring", 0), b.max_hires(w.p) - len(b.workers)))


def publish(w) -> None:
    """Every hour: write each business's open positions (and drop filled or closed ones)."""
    con = w.con
    have = {r["business"]: r for r in con.execute("SELECT * FROM job_openings")}
    for b in w.biz.values():
        n = openings(w, b)
        if n <= 0:
            if b.id in have:
                con.execute("DELETE FROM job_openings WHERE business=?", (b.id,))
            continue
        old = have.get(b.id)
        if old is None:
            con.execute("INSERT INTO job_openings(business, slots, wage, posted_tick, updated_tick) VALUES (?,?,?,?,?)", (b.id, n, b.wage, w.tick, w.tick))
        elif old["slots"] != n or old["wage"] != b.wage:
            con.execute("UPDATE job_openings SET slots=?, wage=?, updated_tick=? WHERE business=?", (n, b.wage, w.tick, b.id))


# --------------------------------------------------------------------------- what people see
def _names(con) -> dict:
    return {r["town_agent"]: r["display_name"] for r in con.execute("SELECT town_agent, display_name FROM town_links WHERE display_name != ''")}


def _name(con, aid: str, names: dict) -> str:
    from .residents import made_up_name
    return names.get(aid) or made_up_name(aid)


def current_job(con, agent: str) -> dict | None:
    r = con.execute("SELECT employer, wage, start_tick FROM jobs WHERE worker=? AND end_tick IS NULL ORDER BY id DESC LIMIT 1", (agent,)).fetchone()
    if r is None:
        return None
    b = con.execute("SELECT type, plot FROM businesses WHERE id=?", (r["employer"],)).fetchone()
    return {"employer": r["employer"], "type": b["type"] if b else "civic", "plot": b["plot"] if b else "", "wage": r["wage"] / C, "since_tick": r["start_tick"]}


def board(con: sqlite3.Connection, user_id: str = "") -> dict:
    """The job board: every open position with its wage and the business behind it, the civic job, who was hired lately,
    and for a resident their own job and requests; for an owner, their businesses' staff and openings."""
    from .card import now_tick
    from .place import _resident
    p = tuned()
    names = _names(con)
    now = now_tick(con)
    staff = {r["employer"]: r["n"] for r in con.execute("SELECT employer, COUNT(*) n FROM jobs WHERE end_tick IS NULL GROUP BY employer")}
    rows = []
    for r in con.execute("""SELECT o.*, b.type, b.plot, b.owner, b.level, b.cart FROM job_openings o JOIN businesses b ON b.id = o.business
                            WHERE b.status='open' ORDER BY o.wage DESC, o.posted_tick, o.business"""):
        cap = p.hires_level1 + (r["level"] - 1) * p.hires_per_level + (p.factory_extra_hires if r["type"] == "factory" else 0)
        rows.append({"business": r["business"], "type": r["type"], "plot": r["plot"], "owner": r["owner"], "owner_name": _name(con, r["owner"], names),
                     "wage": r["wage"] / C, "slots": r["slots"], "staff": staff.get(r["business"], 0), "max_staff": cap, "posted_tick": r["posted_tick"],
                     "above_civic": r["wage"] > p.civic_wage})
    hires = [{"tick": r["start_tick"], "worker": r["worker"], "name": _name(con, r["worker"], names), "employer": r["employer"], "wage": r["wage"] / C}
             for r in con.execute("SELECT * FROM jobs WHERE employer != ? ORDER BY start_tick DESC, id DESC LIMIT 8", (CIVIC,))]
    working = con.execute("SELECT COUNT(*) n, COALESCE(AVG(wage),0) a FROM jobs WHERE end_tick IS NULL AND employer != ?", (CIVIC,)).fetchone()
    out = {"openings": rows, "civic": {"wage": p.civic_wage / C, "workers": staff.get(CIVIC, 0)}, "recent_hires": hires, "now_tick": now,
           "stats": {"in_business_jobs": working["n"], "avg_wage": round(working["a"] / C, 2), "open_positions": sum(r["slots"] for r in rows)},
           "hours": [WORK_HOURS.start, WORK_HOURS.stop], "signed_in": bool(user_id), "resident": False, "me": None, "requests": [], "owned": []}
    me = _resident(con, user_id)
    if me is None:
        return out
    out["resident"] = True
    own = con.execute("SELECT id, type FROM businesses WHERE owner=? AND status='open' AND cart=0 ORDER BY id", (me,)).fetchall()
    out["me"] = {"agent": me, "name": _name(con, me, names), "job": current_job(con, me), "runs": [b["id"] for b in own]}
    out["requests"] = [{"id": r["id"], "kind": r["kind"], "inputs": json.loads(r["inputs"]), "status": r["status"], "refusal": r["refusal"], "detail": r["detail"]}
                       for r in con.execute(f"SELECT * FROM owner_requests WHERE user_id=? AND kind IN ({','.join('?' * len(JOB_KINDS))}) ORDER BY id DESC LIMIT 5",
                                            (user_id, *JOB_KINDS))]
    for b in con.execute("SELECT * FROM businesses WHERE owner=? AND status='open' ORDER BY id", (me,)):
        o = con.execute("SELECT slots FROM job_openings WHERE business=?", (b["id"],)).fetchone()
        cap = 0 if b["cart"] else p.hires_level1 + (b["level"] - 1) * p.hires_per_level + (p.factory_extra_hires if b["type"] == "factory" else 0)
        team = [{"worker": r["worker"], "name": _name(con, r["worker"], names), "wage": r["wage"] / C, "since_tick": r["start_tick"]}
                for r in con.execute("SELECT worker, wage, start_tick FROM jobs WHERE employer=? AND end_tick IS NULL ORDER BY start_tick", (b["id"],))]
        out["owned"].append({"business": b["id"], "type": b["type"], "plot": b["plot"], "wage": b["wage"] / C, "open": o["slots"] if o else 0,
                             "staff": team, "max_staff": cap, "cart": bool(b["cart"])})
    return out


def check_request(con: sqlite3.Connection, agent: str, kind: str, inputs: dict) -> dict:
    """A resident asks to take a job from the board, or to leave theirs."""
    if kind == "quit_job":
        if current_job(con, agent) is None:
            raise JobError("NO_JOB", "you have no job to leave")
        return {}
    emp = str(inputs.get("employer", ""))
    job = current_job(con, agent)
    if job and job["employer"] == emp:
        raise JobError("ALREADY", "you already work there")
    if emp == CIVIC:
        return {"employer": CIVIC}
    b = con.execute("SELECT owner, status FROM businesses WHERE id=?", (emp,)).fetchone()
    if b is None or b["status"] != "open":
        raise JobError("CLOSED", "that business is not open")
    if b["owner"] == agent:
        raise JobError("NOT_ALLOWED", "you already work in your own business")
    if not con.execute("SELECT 1 FROM job_openings WHERE business=?", (emp,)).fetchone():
        raise JobError("NOT_HIRING", "that business is not hiring right now")
    return {"employer": emp}
