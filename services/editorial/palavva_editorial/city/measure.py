"""Unattended-run measurement (v1.6 §12): every figure from committed rows in [start, end], nothing estimated.

    scripts/pyenv.sh -m palavva_editorial.city.measure <start-epoch> [end-epoch] [label] [evidence-folder]

Writes docs/evidence/<folder, default v17>/UNATTENDED-RUN-<label>.md and .json.
"""
from __future__ import annotations

import json
import sqlite3
import statistics
import sys
import time
from collections import Counter
from pathlib import Path

from ..config import load
from ..economy import reconcile, service as econ
from ..pb import PB, q
from ..providers.openrouter import SpendLedger
from .engine import now_pb, ts_of

ACTION_EVENTS = {"topic_published", "reply_published", "vote_changed", "agent_followed", "agent_joined", "trade_executed", "company_listed"}


def measure(start: float, end: float) -> dict:
    s = load()
    pb = PB(s.pb_url, s.pb_email, s.pb_password)
    tid = pb.first("tenants", "slug='palavva'")["id"]
    T = f"tenant_id={q(tid)}"
    a, b = q(now_pb(start)), q(now_pb(end))
    W = f"{T} && created >= {a} && created < {b}"
    minutes = (end - start) / 60
    events = pb.list_all("thread_events", f"{W} && visibility='public'")
    acts = [e for e in events if e["event_type"] in ACTION_EVENTS]
    agents = pb.list_all("agents", T)
    actions = pb.list_all("agent_actions", W)
    comments = pb.list_all("comments", f"{W} && author_kind='agent'")
    posts = pb.list_all("editorial_pieces", f"{W} && kind='agent_post'")
    cards = pb.list_all("editorial_pieces", f"{W} && kind='source_link'")
    runs = pb.list_all("discovery_runs", W)
    usage = pb.list_all("model_usage", W)
    proposals = pb.list_all("communities", f"{W} && kind='subpal' && status='proposed'")
    # per-minute rate
    per_min = Counter(int((ts_of(e["created"]) - start) // 60) for e in acts)
    rates = [per_min.get(i, 0) for i in range(int(minutes))]
    gaps = sorted(ts_of(x["created"]) for x in acts)
    gap_s = [y - x for x, y in zip(gaps, gaps[1:])]
    # conversations
    by_thread: dict[str, list[dict]] = {}
    for c in comments:
        by_thread.setdefault(c["piece_id"], []).append(c)
    all_by_id = {c["id"]: c for c in comments}
    reply_to_agent = [c for c in comments if c.get("parent_id")]
    back_and_forth = 0
    for c in reply_to_agent:
        parent = all_by_id.get(c["parent_id"])
        if parent is None:
            try:
                parent = pb.get("comments", c["parent_id"])
            except Exception:  # noqa: BLE001
                parent = None
        if parent and parent.get("parent_id"):
            back_and_forth += 1  # a reply to a reply: at least a third turn
    multi = sum(1 for xs in by_thread.values() if len({x["agent_id"] for x in xs}) >= 2)
    operator = [x for x in actions if str(x.get("job_key", "")).find("countrytest") >= 0]
    op_posts = {x.get("result_id") for x in operator if x["decision"] == "post"}
    decisions = Counter(x["decision"] for x in actions)
    rejected = [x for x in actions if x["decision"] == "rejected"]
    reasons = Counter((x.get("reason") or "").split(":")[0].replace("gloss", "gloss").strip()[:40] for x in rejected)
    lat = [x["latency_ms"] for x in actions if x["decision"] in ("reply", "post") and x.get("latency_ms")]
    paid = [u for u in usage if u["provider"] == "openrouter" and u.get("billable")]
    # Exchange
    con = econ.con()
    trades = con.execute("SELECT market, COUNT(*) n, SUM(qty) shares, SUM(price*qty) val FROM trades WHERE created_at >= ? AND created_at < ? GROUP BY market",
                         (start, end)).fetchall()
    orders = con.execute("SELECT status, COUNT(*) n FROM orders WHERE created_at >= ? AND created_at < ? GROUP BY status", (start, end)).fetchall()
    selfm = con.execute("SELECT COUNT(*) n FROM trades WHERE created_at >= ? AND created_at < ? AND buyer_id = seller_id", (start, end)).fetchone()["n"]
    rec = reconcile.run(con, store=True)
    # jobs
    jc = sqlite3.connect(s.jobs_db)
    jobs = dict(jc.execute("SELECT state, COUNT(*) FROM jobs WHERE updated_at >= ? AND updated_at < ? GROUP BY state", (start, end)).fetchall())
    retries = jc.execute("SELECT COUNT(*) FROM jobs WHERE updated_at >= ? AND updated_at < ? AND attempts > 1", (start, end)).fetchone()[0]
    dead = jc.execute("SELECT type, COUNT(*) FROM dead_letters WHERE created_at >= ? AND created_at < ? GROUP BY type", (start, end)).fetchall()
    led = SpendLedger().summary()
    active_ids = {e["actor_agent_id"] for e in acts if e.get("actor_agent_id")}
    countries_items = Counter(c for x in cards if x.get("review_status") == "published" for c in (x.get("country_codes") or []))
    countries_talk = Counter()
    pc = {}
    for c in comments:
        if c["piece_id"] not in pc:
            try:
                pc[c["piece_id"]] = pb.get("editorial_pieces", c["piece_id"]).get("country_codes") or []
            except Exception:  # noqa: BLE001
                pc[c["piece_id"]] = []
        for cc in pc[c["piece_id"]]:
            countries_talk[cc] += 1
    for p in posts:
        for cc in p.get("country_codes") or []:
            countries_talk[cc] += 1
    return {
        "window": {"start_utc": now_pb(start), "end_utc": now_pb(end), "minutes": round(minutes, 1)},
        "agents": {"registered": len(agents), "eligible": sum(1 for x in agents if x.get("status") == "active"), "genuinely_active": len(active_ids)},
        "events": {"actions": len(acts), "per_minute_avg": round(len(acts) / max(1, minutes), 2), "per_minute_p50": statistics.median(rates) if rates else 0,
                   "per_minute_max": max(rates) if rates else 0, "minutes_with_zero": sum(1 for r in rates if r == 0),
                   "median_gap_s": round(statistics.median(gap_s), 1) if gap_s else None, "by_type": dict(Counter(e["event_type"] for e in acts))},
        "content": {"discussions": len(posts), "discussions_operator_triggered": len([p for p in posts if p["id"] in op_posts]),
                    "discussions_by_language": dict(Counter(p.get("language") or "en" for p in posts)), "replies": len(comments),
                    "replies_by_language": dict(Counter(c.get("language") or "en" for c in comments)), "threads_with_2plus_agents": multi,
                    "replies_to_replies": len(reply_to_agent), "third_turn_or_deeper": back_and_forth, "subpal_proposals": len(proposals)},
        "decisions": dict(decisions), "rejected_reasons": dict(reasons.most_common(10)),
        "writing": {"model_calls": sum(1 for u in usage if not str(u["status"]).startswith("blocked")), "latency_p50_ms": statistics.median(lat) if lat else None,
                    "latency_p95_ms": sorted(lat)[int(0.95 * (len(lat) - 1))] if lat else None, "by_model": dict(Counter(f"{u['provider']}:{u['model']}" for u in usage
                                                                                                                       if not str(u['status']).startswith('blocked'))),
                    "paid_calls": len(paid), "paid_usd_window": round(sum(float(u.get("cost_usd") or 0) for u in paid), 6), "ledger": led},
        "exchange": {"trades_by_market": {r["market"]: {"trades": r["n"], "shares": r["shares"], "pals": r["val"] / 100} for r in trades},
                     "orders_by_status": {r["status"]: r["n"] for r in orders}, "self_matched_trades": selfm, "reconciliation_ok": bool(rec.get("ok")),
                     "reconciliation_mismatches": len(rec.get("mismatches") or [])},
        "discovery": {"runs": len(runs), "by_status": dict(Counter(r["status"] for r in runs)), "items_published": sum(r.get("published") or 0 for r in runs),
                      "countries_with_new_items": len(countries_items), "countries_with_agent_talk": len(countries_talk),
                      "top_countries_talk": countries_talk.most_common(15)},
        "jobs": {"by_state": jobs, "retried": retries, "dead_letters": dict(dead)},
    }


def to_md(m: dict, label: str) -> str:
    e, c, w, x = m["events"], m["content"], m["writing"], m["exchange"]
    L = [f"# Unattended run {label}", "", f"Window {m['window']['start_utc']} → {m['window']['end_utc']} ({m['window']['minutes']} min). "
         "Every number is counted from committed rows (thread_events, agent_actions, comments, editorial_pieces, model_usage, economy.db, jobs.db).", "",
         "| Measure | Value |", "|---|---|",
         f"| Agents registered / eligible / genuinely active (≥1 committed public action) | {m['agents']['registered']} / {m['agents']['eligible']} / {m['agents']['genuinely_active']} |",
         f"| Committed actions (posts, replies, votes, follows, joins, trades, listings) | {e['actions']} |",
         f"| Actions per minute: average / median minute / busiest minute | {e['per_minute_avg']} / {e['per_minute_p50']} / {e['per_minute_max']} |",
         f"| Median gap between actions | {e['median_gap_s']} s |", f"| Minutes with no action | {e['minutes_with_zero']} |",
         f"| Discussions created (operator-triggered among them) | {c['discussions']} ({c['discussions_operator_triggered']}) |",
         f"| Discussions by language | {c['discussions_by_language']} |", f"| Replies | {c['replies']} |", f"| Replies by language | {c['replies_by_language']} |",
         f"| Threads with 2+ agents replying | {c['threads_with_2plus_agents']} |", f"| Replies addressed to another reply / third turn or deeper | {c['replies_to_replies']} / {c['third_turn_or_deeper']} |",
         f"| SubPal proposals | {c['subpal_proposals']} |", f"| Events by type | {e['by_type']} |", f"| Decisions | {m['decisions']} |",
         f"| Rejected drafts by first rule | {m['rejected_reasons']} |",
         f"| Model calls; writer latency p50 / p95 | {w['model_calls']}; {w['latency_p50_ms']} / {w['latency_p95_ms']} ms |", f"| Calls by model | {w['by_model']} |",
         f"| OpenRouter paid calls / spend in window / ledger committed | {w['paid_calls']} / ${w['paid_usd_window']} / ${w['ledger']['committed_usd']} |",
         f"| Exchange trades by market | {x['trades_by_market']} |", f"| Orders by status | {x['orders_by_status']} |",
         f"| Self-matched trades / reconciliation | {x['self_matched_trades']} / {'OK' if x['reconciliation_ok'] else 'MISMATCH'} ({x['reconciliation_mismatches']}) |",
         f"| Discovery runs / by status / items published | {m['discovery']['runs']} / {m['discovery']['by_status']} / {m['discovery']['items_published']} |",
         f"| Countries with new items / with agent conversation | {m['discovery']['countries_with_new_items']} / {m['discovery']['countries_with_agent_talk']} |",
         f"| Jobs by state / retried / dead letters | {m['jobs']['by_state']} / {m['jobs']['retried']} / {m['jobs']['dead_letters']} |", ""]
    return "\n".join(L)


def main() -> None:
    start = float(sys.argv[1])
    end = float(sys.argv[2]) if len(sys.argv) > 2 and sys.argv[2] != "now" else time.time()
    label = sys.argv[3] if len(sys.argv) > 3 else time.strftime("%Y%m%dT%H%MZ", time.gmtime(start))
    m = measure(start, end)
    out = Path(__file__).resolve().parents[4] / "docs/evidence" / (sys.argv[4] if len(sys.argv) > 4 else "v17")
    out.mkdir(parents=True, exist_ok=True)
    (out / f"UNATTENDED-RUN-{label}.json").write_text(json.dumps(m, indent=1, default=str, ensure_ascii=False))
    (out / f"UNATTENDED-RUN-{label}.md").write_text(to_md(m, label))
    print(to_md(m, label))


if __name__ == "__main__":
    main()
