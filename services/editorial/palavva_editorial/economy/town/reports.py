"""Reports: each player's agent's morning message at 07:00 (Doc 05 sections 2 and 8, Gate C).

Every story points to real records: world events by id, or journal rows by id with the amount they add up to. Nothing
is invented: a morning with nothing to say is written as a quiet morning, never padded. `verify()` re-reads every link.
"""
from __future__ import annotations

import json

from .params import C

STORY_EVENTS = ("hired", "let_go", "worker_left", "contract_signed", "contract_breached", "contract_ended", "business_opened", "business_closed",
                "business_sold", "price_changed", "upgraded", "market_trade", "player_arrived")
# "Newest and most important first" (Doc 06 section 14): a fixed weight per kind, then newest. No AI call ranks them.
IMPORTANCE = {"business_closed": 9, "contract_breached": 8, "business_sold": 8, "worker_left": 7, "business_opened": 7, "starter_grant": 6,
              "contract_signed": 6, "upgraded": 5, "let_go": 5, "hired": 4, "contract_ended": 4, "vote_result": 4, "price_changed": 3,
              "player_arrived": 2, "market_trade": 1}
AWAY_EVENTS = STORY_EVENTS + ("starter_grant", "vote_result")


def rank(events: list) -> list:
    """Most important first, then newest (higher seq). Works on sqlite rows or dicts."""
    return sorted(events, key=lambda e: (-IMPORTANCE.get(e["kind"], 0), -e["seq"]))


def away(con, members: set[str], since_tick: int, limit: int = 12, town_wide: bool = True) -> dict:
    """"While you were away": stored events since `since_tick` about `members` (a person's town agents and businesses),
    plus town-wide public news when `town_wide`. Built only from world_events: a quiet stretch says so and is never padded.
    Withdrawn events and staff events are left out."""
    rows = con.execute("SELECT * FROM world_events WHERE tick >= ? AND withdrawn=0 AND visibility != 'staff' AND kind IN (%s) ORDER BY seq"
                       % ",".join("?" * len(AWAY_EVENTS)), (since_tick, *AWAY_EVENTS)).fetchall()
    mine, town = [], []
    for e in rows:
        who = set(json.loads(e["who"]))
        if members & who:
            mine.append(e)
        elif town_wide and e["visibility"] == "public":
            town.append(e)
    items = [{"event": e["id"], "kind": e["kind"], "text": e["text"], "tick": e["tick"], "yours": True} for e in rank(mine)]
    items += [{"event": e["id"], "kind": e["kind"], "text": e["text"], "tick": e["tick"], "yours": False} for e in rank(town)]
    items = items[:limit]
    return {"since_tick": since_tick, "items": items, "quiet": not items, "total": len(mine) + len(town)}


def morning(w) -> int:
    con = w.con
    since = w.tick - 24
    n = 0
    for a in w.agents.values():
        if not a.is_player or a.arrived_tick > since + 24:
            continue
        mine = set([a.id] + a.businesses)
        stories = []
        found = [e for e in con.execute("SELECT * FROM world_events WHERE tick >= ? AND tick < ? AND withdrawn=0 AND kind IN (%s) ORDER BY seq"
                                        % ",".join("?" * len(STORY_EVENTS)), (since, w.tick, *STORY_EVENTS))
                 if mine & set(json.loads(e["who"])) and e["visibility"] != "staff"]
        for e in rank(found):
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
    """Gate C: every story links to real records, and the amounts add up. Phase 4 gate: no event told twice in a message,
    and no second morning message for the same agent and hour."""
    total = linked = quiet = msgs = padded = duplicates = 0
    seen_msgs: set = set()
    bad = []
    for m in con.execute("SELECT * FROM messages ORDER BY id"):
        msgs += 1
        quiet += m["quiet"]
        sts = json.loads(m["stories"])
        evs = [s["links"]["event"] for s in sts if "event" in s["links"]]
        duplicates += len(evs) - len(set(evs)) + ((m["agent"], m["tick"], m["channel"]) in seen_msgs)
        seen_msgs.add((m["agent"], m["tick"], m["channel"]))
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
            "share_quiet": (quiet / msgs) if msgs else 0.0, "share_with_event": (1 - quiet / msgs) if msgs else 0.0, "padded": padded, "duplicates": duplicates, "bad": bad}
