"""Conservation checks on every tick, and the run fingerprint (Doc 05 sections 4 and 8).

Coins (invariant 1): every asset sums to zero over all accounts (the mints hold the negative), coins held equal coins
created minus coins destroyed, every cached balance equals its journal, and no balance outside a mint is negative.
Goods (invariant 2): every holder's stock equals its goods log; moves net to zero; stock = made + imported - eaten -
worn - exported. Both run incrementally each tick (only the rows added since the last tick), and in full at the end.
"""
from __future__ import annotations

import hashlib
import json
import sqlite3
from collections import defaultdict

from .. import db, reconcile
from . import goods, market


class ConservationError(Exception):
    def __init__(self, tick: int, problems: list[dict]):
        super().__init__(f"conservation failed at tick {tick}: {problems[:3]}")
        self.tick, self.problems = tick, problems


class Checker:
    def __init__(self, con: sqlite3.Connection):
        self.con = con
        self.j_last = 0
        self.g_last = 0
        self.bal: dict[tuple[int, str], int] = defaultdict(int)
        self.stock: dict[tuple[str, str], int] = defaultdict(int)
        self.flow = {"created": 0, "destroyed": 0}
        self.ticks = 0

    def _special(self) -> tuple[set, set]:
        mints = {r["id"] for r in self.con.execute("SELECT id FROM accounts WHERE asset=? AND owner_kind='platform' AND owner_id IN ('town_hall','harbour')", (db.SORA,))}
        burn = {r["id"] for r in self.con.execute("SELECT id FROM accounts WHERE asset=? AND owner_kind='platform' AND owner_id='burn'", (db.SORA,))}
        return mints, burn

    def tick(self, tick: int) -> None:
        con = self.con
        bad: list[dict] = []
        mints, burn = self._special()
        touched: set[int] = set()
        for j in con.execute("SELECT id, from_account, from_bucket, to_account, to_bucket, amount, asset FROM journal WHERE id > ? ORDER BY id", (self.j_last,)):
            self.bal[(j["from_account"], j["from_bucket"])] -= j["amount"]
            self.bal[(j["to_account"], j["to_bucket"])] += j["amount"]
            touched.update((j["from_account"], j["to_account"]))
            if j["asset"] == db.SORA:
                if j["from_account"] in mints and j["to_account"] not in mints:
                    self.flow["created"] += j["amount"]
                elif j["to_account"] in mints | burn and j["from_account"] not in mints | burn:
                    self.flow["destroyed"] += j["amount"]
            self.j_last = j["id"]
        if touched:
            q = ",".join(str(t) for t in touched)
            for a in con.execute(f"SELECT id, owner_kind, owner_id, asset, available, reserved FROM accounts WHERE id IN ({q})"):
                for bk in ("available", "reserved"):
                    if a[bk] != self.bal[(a["id"], bk)]:
                        bad.append({"check": "journal_rebuild", "account": a["id"], "bucket": bk, "cached": a[bk], "journal": self.bal[(a["id"], bk)]})
                mint = a["owner_kind"] == "platform" and (a["owner_id"] in ("town_hall", "harbour") or a["owner_id"].startswith("mint:"))
                if not mint and (a["available"] < 0 or a["reserved"] < 0):
                    bad.append({"check": "negative", "account": a["id"]})
        for r in con.execute("SELECT asset, SUM(available + reserved) s FROM accounts GROUP BY asset"):
            if r["s"] != 0:
                bad.append({"check": "conservation", "asset": r["asset"], "sum": r["s"]})
        held = con.execute("""SELECT COALESCE(SUM(available + reserved),0) s FROM accounts WHERE asset=? AND NOT (owner_kind='platform'
                              AND owner_id IN ('town_hall','harbour','burn'))""", (db.SORA,)).fetchone()["s"]
        if held != self.flow["created"] - self.flow["destroyed"]:
            bad.append({"check": "coins_held", "held": held, "created": self.flow["created"], "destroyed": self.flow["destroyed"]})
        tg: set[tuple[str, str]] = set()
        net: dict[str, int] = defaultdict(int)
        for g in con.execute("SELECT id, holder, good, change, cause FROM goods_log WHERE id > ? ORDER BY id", (self.g_last,)):
            self.stock[(g["holder"], g["good"])] += g["change"]
            tg.add((g["holder"], g["good"]))
            if g["cause"] == "moved":
                net[g["good"]] += g["change"]
            self.g_last = g["id"]
        for good_, n in net.items():
            if n != 0:
                bad.append({"check": "goods_moves", "good": good_, "net": n})
        for h, gd in tg:
            q, _r = goods.get(con, h, gd)
            if q != self.stock[(h, gd)]:
                bad.append({"check": "goods_rebuild", "holder": h, "good": gd, "stock": q, "log": self.stock[(h, gd)]})
        self.ticks += 1
        if bad:
            raise ConservationError(tick, bad)

    def full(self) -> dict:
        rec = reconcile.run(self.con, store=False)
        gbad = goods.check(self.con)
        rbad, _cash = market.check_reservations(self.con)
        return {"ok": rec["ok"] and not gbad and not rbad, "ledger": {k: rec[k] for k in ("ok", "accounts", "journal_rows", "mismatches", "supply_sora",
                                                                                          "issued_sora", "destroyed_sora")},
                "goods": gbad, "reservations": rbad}


def fingerprint(con: sqlite3.Connection) -> str:
    """SHA-256 of the ledger and stock tables (Doc 05 section 4). Transaction ids are left out (they are labels)."""
    h = hashlib.sha256()
    for r in con.execute("SELECT owner_kind, owner_id, asset, available, reserved FROM accounts ORDER BY owner_kind, owner_id, asset"):
        h.update(json.dumps(list(r)).encode())
    for r in con.execute("SELECT id, kind, from_account, from_bucket, to_account, to_bucket, asset, amount, ref_type, ref_id, rule, created_at FROM journal ORDER BY id"):
        h.update(json.dumps(list(r)).encode())
    for r in con.execute("SELECT holder, good, qty, reserved FROM stock ORDER BY holder, good"):
        h.update(json.dumps(list(r)).encode())
    for r in con.execute("SELECT id, tick, holder, good, change, cause FROM goods_log ORDER BY id"):
        h.update(json.dumps(list(r)).encode())
    return h.hexdigest()
