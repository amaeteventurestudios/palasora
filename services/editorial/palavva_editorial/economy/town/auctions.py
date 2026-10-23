"""Palasora step 4: property auctions. Once a day (09:00) the Town Hall puts one free prime plot up for auction for a day,
while there are people in town to bid. The reserve is the plot's listed price. A bid holds the bidder's Sora in the
ledger's reserved bucket (it can't be spent elsewhere); an outbid bidder's hold is released at once. A bid in the last
two hours adds two hours, so nobody wins by sniping. When the auction ends the winner's hold is released and paid to the
Town Hall (destroyed, like every plot payment) and the plot is theirs, empty, to build on later without paying for the
land again. An auction with no bids ends unsold and the plot goes back on sale at its listed price.

Bids pass the Actions gate (`bid`), so the owner's limits apply; people bid through requests like every other change.
"""
from __future__ import annotations

from .. import db, ledger
from .params import C

DURATION = 24      # hours an auction runs
SNIPE = 2          # a bid this close to the end adds this many hours
HOUR_LISTED = 9


def step_of(high: int) -> int:
    """The smallest raise over the highest bid: 5% or 5 Sora, whichever is more."""
    return max(5 * C, (high * 5 + 99) // 100)


def min_bid(a: dict) -> int:
    return a["high"] + step_of(a["high"]) if a["high_bidder"] else a["reserve"]


def open_auctions(con) -> list[dict]:
    return [dict(r) for r in con.execute("SELECT * FROM auctions WHERE status='open' ORDER BY id")]


def load(w) -> None:
    w.at_auction = {r["plot"] for r in w.con.execute("SELECT plot FROM auctions WHERE status='open'")}


def list_daily(w) -> str | None:
    """09:00: one free prime plot goes up for auction, if none is running and people live in town."""
    if w.hour != HOUR_LISTED or w.at_auction or not any(a.is_player for a in w.agents.values()):
        return None
    carts = {b.plot for b in w.open_biz() if b.cart}
    free = sorted((p for p in w.plots.values() if p["use"] == "business" and p["prime"] and not p["owner"] and not p["building"] and p["id"] not in carts),
                  key=lambda p: p["id"])
    if not free:
        return None
    pl = free[(w.day * 7) % len(free)]  # a different corner of the square each day
    reserve = w.p.plot_price(pl)
    cur = w.con.execute("INSERT INTO auctions(plot, reserve, start_tick, end_tick, status) VALUES (?,?,?,?, 'open')",
                        (pl["id"], reserve, w.tick, w.tick + DURATION))
    w.at_auction.add(pl["id"])
    w.event("auction_opened", [], f"Plot {pl['id']} is up for auction until tomorrow {(w.tick + DURATION) % 24:02d}:00, from {reserve / C:.0f} Sora",
            visibility="public", refs={"plot": pl["id"], "auction": cur.lastrowid, "reserve": reserve})
    return pl["id"]


def _acct(w, aid: str) -> int:
    a = w.agents[aid]
    return w.acct_id(a.owner_kind, a.id, a.owner_key)


def bid(w, a, auction: int, amount: int) -> dict:
    """Place a bid (called by the Actions gate after its checks). Raises actions.Refused when the bid can't stand."""
    from .actions import Refused
    r = w.con.execute("SELECT * FROM auctions WHERE id=?", (auction,)).fetchone()
    if r is None or r["status"] != "open" or r["end_tick"] <= w.tick:
        raise Refused("CLOSED", f"auction {auction} is not open")
    au = dict(r)
    need = min_bid(au)
    if amount < need:
        raise Refused("LOW_BID", f"the lowest bid now is {need / C:.0f} Sora")
    mine = au["high_bidder"] == a.id
    held = au["high"] if mine else 0
    if w.bal(a.acct) + held < amount:
        raise Refused("INSUFFICIENT", "not enough Sora for that bid")
    k = f"t{w.tick}"
    if au["high_bidder"]:
        ledger.release(w.con, _acct(w, au["high_bidder"]), db.SORA, au["high"], idem_key=w.key("release"), ref_type="auction", ref_id=str(auction), txn_id=k)
        w.con.execute("UPDATE bids SET status='outbid' WHERE auction=? AND status='leading'", (auction,))
        if not mine:
            w.event("outbid", [au["high_bidder"]], f"{au['high_bidder']} was outbid on plot {au['plot']}: the highest bid is now {amount / C:.0f} Sora",
                    visibility="owner", refs={"plot": au["plot"], "auction": auction})
    ledger.reserve(w.con, _acct(w, a.id), db.SORA, amount, idem_key=w.key("hold"), ref_type="auction", ref_id=str(auction), txn_id=k)
    w.con.execute("INSERT INTO bids(auction, bidder, amount, tick, status) VALUES (?,?,?,?, 'leading')", (auction, a.id, amount, w.tick))
    end = au["end_tick"] + SNIPE if au["end_tick"] - w.tick <= SNIPE else au["end_tick"]
    w.con.execute("UPDATE auctions SET high=?, high_bidder=?, bids=bids+1, end_tick=? WHERE id=?", (amount, a.id, end, auction))
    return {"auction": auction, "amount": amount, "ends_tick": end}


def close_due(w) -> int:
    """Settle every auction whose time is up: the winner pays from the hold and gets the plot."""
    from .civic import TOWN_HALL
    n = 0
    for au in w.con.execute("SELECT * FROM auctions WHERE status='open' AND end_tick <= ? ORDER BY id", (w.tick,)).fetchall():
        n += 1
        pid = au["plot"]
        w.at_auction.discard(pid)
        if not au["high_bidder"]:
            w.con.execute("UPDATE auctions SET status='unsold' WHERE id=?", (au["id"],))
            w.event("auction_unsold", [], f"No bids for plot {pid}: it is back on sale at {au['reserve'] / C:.0f} Sora", visibility="public",
                    refs={"plot": pid, "auction": au["id"]})
            continue
        win = w.agents[au["high_bidder"]]
        ledger.release(w.con, _acct(w, win.id), db.SORA, au["high"], idem_key=w.key("release"), ref_type="auction", ref_id=str(au["id"]), txn_id=f"t{w.tick}")
        w.sink(win.acct, TOWN_HALL, au["high"], rule="plot_auction", ref_type="plot", ref_id=pid)
        w.plots[pid]["owner"] = win.id
        w.con.execute("UPDATE plots SET owner=? WHERE id=?", (win.id, pid))
        w.con.execute("UPDATE bids SET status='won' WHERE auction=? AND status='leading'", (au["id"],))
        w.con.execute("UPDATE auctions SET status='sold', winner=?, price=? WHERE id=?", (win.id, au["high"], au["id"]))
        w.event("auction_won", [win.id], f"{win.id} won plot {pid} at auction for {au['high'] / C:.0f} Sora ({au['bids']} bid{'s' if au['bids'] != 1 else ''})",
                visibility="public", refs={"plot": pid, "auction": au["id"], "price": au["high"]})
    return n
