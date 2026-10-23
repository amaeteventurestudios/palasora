"""Palasora: the residents directory. Everyone who lives in town, with a live count, search by name or @handle, and
filters for residents with no home or no job. Each resident has a card: street address, job, income, net worth (from
the ledger), neighbours, the businesses they run, and recent events; a signed-in person can follow them.

House agents live in the town's shared homes (several flats to a home plot, from their home coordinates); a person's
agent lives in the home plot it owns, or has no home yet. Names: a linked resident shows its public display name; a
house agent gets a stable made-up name from its id (no real people).
"""
from __future__ import annotations

import json
import sqlite3
import zlib

from .card import money, now_tick
from .params import C
from .world import EPOCH

FIRST = ("Ada", "Kofi", "Amara", "Zainab", "Tunde", "Ife", "Chidi", "Nia", "Musa", "Yaw", "Ama", "Lena", "Mateo", "Priya", "Kenji",
         "Sofia", "Omar", "Leila", "Jonas", "Mei", "Femi", "Esi", "Kwame", "Halima", "Bayo", "Nkechi", "Thabo", "Lindiwe", "Sipho",
         "Aisha", "Emeka", "Adaeze", "Kojo", "Efua", "Malik", "Imani", "Dayo", "Tolu", "Ngozi", "Jide", "Rosa", "Ana", "Luca", "Hana",
         "Ravi", "Noor", "Elif", "Tariq", "Yara", "Ola")
LAST = ("Okafor", "Mensah", "Bello", "Diallo", "Adeyemi", "Nwosu", "Owusu", "Kamara", "Banda", "Mwangi", "Okoro", "Asante", "Sesay",
        "Ndlovu", "Achebe", "Toure", "Abara", "Eze", "Boateng", "Phiri", "Silva", "Rossi", "Tanaka", "Khan", "Novak", "Haddad", "Costa",
        "Lindqvist", "Park", "Moreau")
STREETS = ("Palm Street", "Baobab Street", "Harmattan Road", "Lagoon Street", "Cocoa Row", "Market Road", "Harbour Lane", "Mill Street",
           "Granary Road", "Field Lane")
ROLE = {"entrepreneur": "Entrepreneur", "worker": "Worker", "trader": "Trader", "consumer": "Resident"}
TYPE = {"farm": "farm", "workshop": "workshop", "stall": "food stall", "delivery": "delivery depot", "factory": "food factory"}
FILTERS = ("all", "no_home", "no_job", "following")


def made_up_name(aid: str) -> str:
    h = zlib.crc32(aid.encode())
    return f"{FIRST[h % len(FIRST)]} {LAST[(h // len(FIRST)) % len(LAST)]}"


def handle_of(aid: str, name: str) -> str:
    first = "".join(ch for ch in name.split(" ")[0].split("'")[0].lower() if ch.isalnum()) or "resident"
    return f"{first}{''.join(ch for ch in aid if ch.isdigit()) or aid}"


def _names(con: sqlite3.Connection) -> dict:
    return {r["town_agent"]: r["display_name"] for r in con.execute("SELECT town_agent, display_name FROM town_links WHERE display_name != ''")}


def _people(con: sqlite3.Connection) -> list[dict]:
    """Every active resident with their home plot, flat, address and job (no money yet: that's per page)."""
    names = _names(con)
    homes = {(int(r["x"]), int(r["y"])): dict(r) for r in con.execute("SELECT id, x, y, owner FROM plots WHERE use='home'")}
    owned = {r["owner"]: r["id"] for r in con.execute("SELECT id, owner FROM plots WHERE use='home' AND owner != ''")}
    plot_xy = {r["id"]: (int(r["x"]), int(r["y"])) for r in con.execute("SELECT id, x, y FROM plots")}
    biz = {r["id"]: dict(r) for r in con.execute("SELECT id, type, plot, owner, status, cart FROM businesses")}
    jobs = {r["worker"]: dict(r) for r in con.execute("SELECT employer, worker, wage FROM jobs WHERE end_tick IS NULL")}
    runs: dict[str, list] = {}
    for b in biz.values():
        if b["status"] == "open":
            runs.setdefault(b["owner"], []).append(b)
    out = []
    for a in con.execute("SELECT id, kind, role, home, arrived_tick FROM town_agents WHERE status='active' AND role != 'mischief' ORDER BY id"):
        aid = a["id"]
        home = owned.get(aid)
        if home is None and a["kind"] == "house" and a["home"]:
            try:
                x, y = json.loads(a["home"])
                h = homes.get((int(round(x)), int(round(y))))
                home = h["id"] if h else None
            except (ValueError, TypeError):
                home = None
        name = names.get(aid) or made_up_name(aid)
        j = jobs.get(aid)
        mine = runs.get(aid, [])
        if j and j["employer"] in biz:
            e = biz[j["employer"]]
            job = {"kind": "works", "business": e["id"], "type": e["type"], "plot": e["plot"], "wage": j["wage"] / C,
                   "text": f"Works at the {TYPE.get(e['type'], e['type'])} on plot {e['plot']}"}
        elif mine:
            b = mine[0]
            job = {"kind": "runs", "business": b["id"], "type": b["type"], "plot": b["plot"], "wage": 0,
                   "text": f"Runs a food cart by plot {b['plot']}" if b["cart"] else f"Runs the {TYPE.get(b['type'], b['type'])} on plot {b['plot']}"}
        else:
            job = None
        out.append({"id": aid, "name": name, "handle": handle_of(aid, name), "kind": a["kind"], "role": ROLE.get(a["role"], a["role"].title()),
                    "home": home, "job": job, "runs": [b["id"] for b in mine], "arrived_tick": a["arrived_tick"], "xy": plot_xy.get(home) if home else None})
    # flats: residents sharing a home plot are numbered in id order; the plot's column and row give the street address
    by_home: dict[str, list] = {}
    for p in out:
        if p["home"]:
            by_home.setdefault(p["home"], []).append(p)
    for pid, ps in by_home.items():
        x, y = plot_xy[pid]
        street = STREETS[y % len(STREETS)]
        for k, p in enumerate(ps, start=1):
            p["address"] = f"{(x + 1) * 2 - y % 2} {street}" + (f", flat {k}" if len(ps) > 1 else "")
    for p in out:
        p.setdefault("address", "")
    return out


def _acct(con: sqlite3.Connection, kind: str, oid: str) -> sqlite3.Row | None:
    return con.execute("SELECT id, available, reserved FROM accounts WHERE owner_kind=? AND owner_id=? AND asset='SORA'", (kind, oid)).fetchone()


def _money(con: sqlite3.Connection, p: dict, since: float) -> dict:
    """Net worth = wallet (available and held) + the balances of the businesses they run; income = a day's wage + their
    businesses' average daily profit over the last week, from the ledger."""
    wallet = 0
    for kind in ("agent", "human"):
        a = _acct(con, kind, p["id"])
        if a:
            wallet += a["available"] + a["reserved"]
    worth, profit = wallet, 0
    for bid in p["runs"]:
        a = _acct(con, "company", bid)
        if a:
            worth += a["available"] + a["reserved"]
            profit += money(con, a["id"], since)["profit"]
    wage = round((p["job"] or {}).get("wage", 0) * C) if p["job"] and p["job"]["kind"] == "works" else 0
    return {"wallet": wallet / C, "net_worth": worth / C, "income": round((wage + profit / 7) / C, 2)}


def _row(p: dict) -> dict:
    return {k: p[k] for k in ("id", "name", "handle", "kind", "role", "home", "address", "job")}


def following(con: sqlite3.Connection, user_id: str) -> set[str]:
    if not user_id:
        return set()
    return {r["agent"] for r in con.execute("SELECT agent FROM town_follows WHERE user_id=?", (user_id,))}


def directory(con: sqlite3.Connection, q: str = "", filt: str = "all", viewer: str = "", limit: int = 30, offset: int = 0) -> dict:
    people = _people(con)
    follows = following(con, viewer)
    counts = {"all": len(people), "no_home": sum(1 for p in people if not p["home"]), "no_job": sum(1 for p in people if not p["job"]),
              "following": sum(1 for p in people if p["id"] in follows)}
    sel = {"no_home": lambda p: not p["home"], "no_job": lambda p: not p["job"], "following": lambda p: p["id"] in follows}.get(filt, lambda p: True)
    q = q.strip().lower().lstrip("@")
    rows = [p for p in people if sel(p) and (not q or q in p["name"].lower() or p["handle"].startswith(q) or q == p["id"].lower()
                                              or q in p["address"].lower())]
    if q:  # an exact @handle first
        rows.sort(key=lambda p: (p["handle"] != q, p["name"]))
    since = EPOCH + max(0, now_tick(con) - 24 * 7) * 3600
    page = rows[offset: offset + max(1, min(limit, 100))]
    mine = me(con, viewer)
    return {"counts": counts, "total": len(rows), "offset": offset, "me": mine,
            "rows": [_row(p) | _money(con, p, since) | {"following": p["id"] in follows} for p in page]}


def me(con: sqlite3.Connection, viewer: str) -> str | None:
    if not viewer:
        return None
    r = con.execute("SELECT town_agent FROM town_links WHERE user_id=? AND user_id != '' AND town_agent NOT LIKE 'b%' ORDER BY town_agent LIMIT 1",
                    (viewer,)).fetchone()
    return r["town_agent"] if r else None


def resident(con: sqlite3.Connection, aid: str, viewer: str = "") -> dict | None:
    people = _people(con)
    p = next((x for x in people if x["id"] == aid), None)
    if p is None:
        return None
    since = EPOCH + max(0, now_tick(con) - 24 * 7) * 3600
    out = _row(p) | _money(con, p, since) | {"arrived_tick": p["arrived_tick"], "following": aid in following(con, viewer),
                                             "followers": con.execute("SELECT COUNT(*) n FROM town_follows WHERE agent=?", (aid,)).fetchone()["n"],
                                             "is_me": me(con, viewer) == aid, "signed_in": bool(viewer)}
    # neighbours: the same home, then the homes next door
    near = []
    if p["xy"]:
        x, y = p["xy"]
        for o in people:
            if o["id"] != aid and o["xy"] and abs(o["xy"][0] - x) <= 1 and abs(o["xy"][1] - y) <= 1:
                near.append((o["xy"] != p["xy"], o["name"], o))
    out["neighbours"] = [{"id": o["id"], "name": o["name"], "handle": o["handle"], "address": o["address"], "same_home": not d}
                         for d, _n, o in sorted(near, key=lambda t: (t[0], t[1]))[:6]]
    out["businesses"] = [dict(r) for r in con.execute(
        f"SELECT id, type, plot, level, cart FROM businesses WHERE status='open' AND id IN ({','.join('?' * len(p['runs']))})", p["runs"])] if p["runs"] else []
    names = _names(con)
    out["events"] = []
    for e in con.execute("SELECT id, tick, text, who FROM world_events WHERE visibility='public' AND who LIKE ? ORDER BY seq DESC LIMIT 20", (f'%"{aid}"%',)):
        if aid in json.loads(e["who"]):
            text = e["text"]
            for k, v in names.items():
                text = text.replace(k, v)
            out["events"].append({"id": e["id"], "tick": e["tick"], "text": text.replace(aid, p["name"])})
        if len(out["events"]) >= 5:
            break
    return out


def follow(con: sqlite3.Connection, user_id: str, aid: str, on: bool) -> dict:
    if not con.execute("SELECT 1 FROM town_agents WHERE id=? AND status='active'", (aid,)).fetchone():
        raise KeyError(aid)
    if on:
        con.execute("INSERT OR IGNORE INTO town_follows(user_id, agent, tick) VALUES (?,?,?)", (user_id, aid, now_tick(con)))
    else:
        con.execute("DELETE FROM town_follows WHERE user_id=? AND agent=?", (user_id, aid))
    return {"following": on, "followers": con.execute("SELECT COUNT(*) n FROM town_follows WHERE agent=?", (aid,)).fetchone()["n"]}

