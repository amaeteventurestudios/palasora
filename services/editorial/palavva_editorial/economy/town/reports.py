"""Reports: each player's agent's morning message at 07:00 (Doc 05 sections 2 and 8, Gate C).

Every story points to real records: world events by id, or journal rows by id with the amount they add up to. Nothing
is invented: a morning with nothing to say is written as a quiet morning, never padded. `verify()` re-reads every link.
"""
from __future__ import annotations

import json

from .params import C

STORY_EVENTS = ("hired", "let_go", "worker_left", "contract_signed", "contract_breached", "contract_ended", "business_opened", "business_closed",
                "business_sold", "price_changed", "upgraded", "market_trade", "player_arrived")


def morning(w) -> int:
    con = w.con
    since = w.tick - 24
    n = 0
    for a in w.agents.values():
        if not a.is_player or a.arrived_tick > since + 24:
            continue
        mine = set([a.id] + a.businesses)
        stories = []
        for e in con.execute("SELECT * FROM world_events WHERE tick >= ? AND tick < ? AND kind IN (%s) ORDER BY seq" % ",".join("?" * len(STORY_EVENTS)),
                             (since, w.tick, *STORY_EVENTS)):
            if mine & set(json.loads(e["who"])) and e["visibility"] != "staff":
                stories.append({"text": e["text"], "links": {"event": e["id"]}})
        accts = [w.acct_id(*a.acct, a.owner_key)] + [w.acct_id("company", b, a.owner_key) for b in a.businesses]
        for acct, label in zip(accts, ["you"] + a.businesses):
            rows = con.execute("""SELECT id, amount, kind, rule FROM journal WHERE to_account=? AND created_at >= ? AND created_at < ?
                                  AND kind IN ('revenue','wage','issue','goods_cash') AND rule NOT IN ('genesis','new_player_grant','scenario_endowment') ORDER BY id""",
                               (acct, w.ts(since), w.ts())).fetchall()
            if rows:
                total = sum(r["amount"] for r in rows)
                what = "earned" if label == "you" else f"{label} took in"
                stories.append({"text": f"{'You' if label == 'you' else label} {what if label != 'you' else 'earned'} {total / C:.2f} Sora since yesterday morning",
                                "links": {"journal": [r["id"] for r in rows], "amount": total, "account": acct}})
        quiet = not stories
        text = "Quiet morning: nothing changed for you since yesterday." if quiet else " ".join(s["text"] + "." for s in stories[:6])
        con.execute("INSERT INTO messages(agent, tick, channel, text, stories, quiet) VALUES (?,?,?,?,?,?)",
                    (a.id, w.tick, "morning", text, json.dumps(stories), int(quiet)))
        n += 1
    return n


def verify(con) -> dict:
    """Gate C: every story links to real records, and the amounts add up."""
    total = linked = quiet = msgs = padded = 0
    bad = []
    for m in con.execute("SELECT * FROM messages ORDER BY id"):
        msgs += 1
        quiet += m["quiet"]
        sts = json.loads(m["stories"])
        padded += bool(m["quiet"]) == bool(sts)  # a quiet morning with stories, or a busy one without any
        for s in sts:
            total += 1
            ok = True
            lk = s["links"]
            if "event" in lk:
                ok = con.execute("SELECT 1 FROM world_events WHERE id=?", (lk["event"],)).fetchone() is not None
            if "journal" in lk:
                ids = lk["journal"]
                rows = con.execute(f"SELECT amount, to_account FROM journal WHERE id IN ({','.join('?' * len(ids))})", ids).fetchall()
                ok = ok and len(rows) == len(ids) and sum(r["amount"] for r in rows) == lk["amount"] and all(r["to_account"] == lk["account"] for r in rows)
            if not lk:
                ok = False
            linked += ok
            if not ok and len(bad) < 20:
                bad.append({"message": m["id"], "story": s["text"]})
    return {"messages": msgs, "stories": total, "linked": linked, "share_linked": (linked / total) if total else 1.0, "quiet": quiet,
            "share_quiet": (quiet / msgs) if msgs else 0.0, "share_with_event": (1 - quiet / msgs) if msgs else 0.0, "padded": padded, "bad": bad}
