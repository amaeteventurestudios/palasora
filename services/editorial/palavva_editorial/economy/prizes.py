"""Game prize pots paid in Sora (Agent Grand Prix's weekly league first).

A game's server sends the final table of a finished week; each winner's share is created by the Town Hall mint into that
person's own Sora account (the same account the Palasora wallet shows). A pot is fixed per game and week, so a week can
never pay out more than its pot, and each place is paid once: sending the same week again changes nothing.
"""
from __future__ import annotations

import sqlite3

from . import db, ledger

GAMES = {"agp": {"name": "Agent Grand Prix", "rule": "agp_weekly_prize", "pot_switch": "AGP_WEEKLY_POT", "pot": 10_000}}


class PrizeError(Exception):
    def __init__(self, code: str, message: str = ""):
        super().__init__(message or code)
        self.code = code


def pot(con: sqlite3.Connection, game: str) -> int:
    g = GAMES[game]
    r = con.execute("SELECT value FROM switches WHERE key=?", (g["pot_switch"],)).fetchone()
    try:
        return max(0, int(r["value"])) if r and str(r["value"]).strip() else g["pot"]
    except (TypeError, ValueError):
        return g["pot"]


def paid(con: sqlite3.Connection, game: str, week: int) -> int:
    r = con.execute("SELECT COALESCE(SUM(amount),0) s FROM journal WHERE rule=? AND ref_type=? AND ref_id=?",
                    (GAMES[game]["rule"], f"{game}_week", str(week))).fetchone()
    return int(r["s"])


def pay_week(con: sqlite3.Connection, game: str, week: int, payouts: list[dict]) -> dict:
    if game not in GAMES:
        raise PrizeError("UNKNOWN_GAME")
    if week < 1:
        raise PrizeError("BAD_WEEK")
    g, cap = GAMES[game], pot(con, game)
    lines, seen = [], set()
    with db.tx(con):
        for p in payouts:
            uid, place, amount = str(p.get("user_id", "")), int(p.get("place", 0)), int(p.get("amount", 0))
            if not uid or len(uid) > 64 or place < 1 or amount <= 0 or place in seen:
                raise PrizeError("BAD_PAYOUT", f"bad payout line {p!r}")
            seen.add(place)
            idem = f"{game}:w{week}:p{place}"
            if con.execute("SELECT id FROM journal WHERE idem_key=?", (idem,)).fetchone():
                lines.append({"place": place, "user_id": uid, "amount": amount, "status": "already_paid"})
                continue
            if paid(con, game, week) + amount > cap:
                raise PrizeError("OVER_POT", f"week {week} would pay more than its pot of {cap} Sora")
            jid = ledger.issue(con, uid, amount, idem_key=idem, rule=g["rule"], ref_type=f"{game}_week", ref_id=str(week),
                               memo=f"{g['name']} week {week}, place {place}", owner_kind="human", owner_key=f"user:{uid}")
            lines.append({"place": place, "user_id": uid, "amount": amount, "status": "paid", "journal_id": jid})
    return {"game": game, "week": week, "pot": cap, "paid": paid(con, game, week), "lines": lines}


def history(con: sqlite3.Connection, game: str, limit: int = 500) -> list[dict]:
    g = GAMES[game]
    rows = con.execute("""SELECT j.id, j.amount, j.ref_id week, j.memo, j.created_at, a.owner_id user_id FROM journal j
                          JOIN accounts a ON a.id=j.to_account WHERE j.rule=? ORDER BY j.id DESC LIMIT ?""", (g["rule"], limit))
    return [dict(r) for r in rows]
