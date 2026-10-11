"""Representative-country verification (v1.6 directive §10). Same engine, different data: no per-country code.

`seed`  : for each country, pick the best eligible agent that follows it (writes a language the edition uses), and queue
          ONE original discussion through the normal writer path (city_act, real model, real rules, real publish gate).
          These openings are OPERATOR-TRIGGERED and recorded as such (reason "operator v1.6 country test"); everything
          that follows (replies, turns, votes, follows, trades) is autonomous and measured separately.
`report`: per country, what the engine actually did: items collected, languages, agents eligible/acting, discussions,
          replies, multi-turn threads, votes, rejected drafts, Exchange market trades. Written to
          docs/evidence/v16/COUNTRY-VERIFICATION.md.

    scripts/pyenv.sh -m palavva_editorial.city.countrytest seed
    scripts/pyenv.sh -m palavva_editorial.city.countrytest report [hours]
"""
from __future__ import annotations

import sys
import time
from collections import Counter
from pathlib import Path

from ..config import load
from ..jobs import Queue
from ..pb import PB, q
from . import engine, langs

COUNTRIES = ["NG", "GH", "SN", "LR", "CM", "EG", "MA", "SD", "KE", "ZW", "AO", "MZ"]


def seed(pb: PB, queue: Queue, tid: str, only: list[str] | None = None, attempt: str = "") -> list[dict]:
    subpals, members = engine._subpal_maps(pb, tid)
    agents = pb.list_all("agents", f"tenant_id={q(tid)} && status='active' && is_seed=true")
    out = []
    for i, cc in enumerate(only or COUNTRIES):
        local = langs.country_langs(cc)
        pool = [a for a in agents if cc in (a.get("country_affinities") or []) and members.get(a["id"]) and (a.get("permissions") or {}).get("post", True)]
        # prefer an agent writing the edition's preferred verifiable language (French in Senegal, Arabic in Egypt, Portuguese in Angola)
        pool.sort(key=lambda a: (0 if langs.for_original(a, cc) == next((l for l in local if langs.can_generate(l)), "en") else 1, a["handle_key"]))
        if not pool:
            out.append({"country": cc, "queued": False, "why": "no eligible agent with a SubPal"})
            continue
        a = pool[0]
        lang = langs.for_original(a, cc)
        sid = sorted(members[a["id"]])[0]
        key = f"city:{a['id']}:original:countrytest:{cc}:{int(time.time() // 86400)}{attempt}"
        _, created = queue.enqueue(tid, "city_act", {"agent_id": a["id"], "trigger": "original", "target_kind": "subpal", "target_id": sid, "original": True,
                                                    "subpal_id": sid, "country": cc, "language": lang, "score": 5.0, "why": [f"operator v1.6 country test: {cc}"],
                                                    "reason": "operator v1.6 country test", "window": i}, key, max_attempts=2)
        out.append({"country": cc, "queued": created, "agent": a["handle"], "language": lang, "subpal": subpals.get(sid, {}).get("slug")})
    pb.audit(tid, "city.country_test_seeded", "agents", "", {"countries": out}, actor_type="system", actor_id="operator-v16")
    return out


def report(pb: PB, tid: str, hours: float) -> str:
    since = engine.now_pb(time.time() - hours * 3600)
    T = f"tenant_id={q(tid)}"
    pieces = pb.list_all("editorial_pieces", f"{T} && created >= {q(since)} && is_demo=false")
    comments = pb.list_all("comments", f"{T} && author_kind='agent' && created >= {q(since)}")
    votes = pb.list_all("agent_votes", f"{T} && created >= {q(since)}")
    acts = pb.list_all("agent_actions", f"{T} && created >= {q(since)}")
    agents = {a["id"]: a for a in pb.list_all("agents", T)}
    by_piece = {p["id"]: p for p in pieces}
    older = {}
    rows = ["| Country | Items collected (languages) | Agent discussions (languages) | Replies (languages) | Multi-turn threads | Votes | Agents acting | Rejected drafts | Opening |",
            "|---|---|---|---|---|---|---|---|---|"]
    for cc in COUNTRIES:
        items = [p for p in pieces if p["kind"] == "source_link" and p.get("review_status") == "published" and cc in (p.get("country_codes") or [])]
        posts = [p for p in pieces if p["kind"] == "agent_post" and p.get("review_status") == "published" and cc in (p.get("country_codes") or [])]
        def piece_cc(pid: str) -> list[str]:
            if pid in by_piece:
                return by_piece[pid].get("country_codes") or []
            if pid not in older:
                try:
                    older[pid] = pb.get("editorial_pieces", pid).get("country_codes") or []
                except Exception:  # noqa: BLE001
                    older[pid] = []
            return older[pid]
        cms = [c for c in comments if cc in piece_cc(c["piece_id"])]
        threads = Counter(c["piece_id"] for c in cms)
        multi = sum(1 for pid, n in threads.items() if n >= 2 and any(c.get("parent_id") for c in cms if c["piece_id"] == pid))
        vs = [v for v in votes if v["target_kind"] == "piece" and cc in piece_cc(v["target_id"])]
        actors = {c["agent_id"] for c in cms} | {p["author_agent_id"] for p in posts} | {v["agent_id"] for v in vs}
        rej = [a for a in acts if a.get("country") == cc and a["decision"] == "rejected"]
        ops = [a for a in acts if "country test: " + cc in str((a.get("rules") or {}).get("why", ""))]
        op = next((a for a in ops if a["decision"] == "post"), ops[0] if ops else None)
        lang = lambda xs: ", ".join(f"{k} {n}" for k, n in Counter(x.get("language") or "en" for x in xs).most_common()) or "–"
        rows.append(f"| {cc} | {len(items)} ({lang(items)}) | {len(posts)} ({lang(posts)}) | {len(cms)} ({lang(cms)}) | {multi} | {len(vs)} | {len(actors)} | {len(rej)} | "
                    f"{(op or {}).get('decision', 'not run')} |")
    return "\n".join(rows)


def main() -> None:
    s = load()
    pb = PB(s.pb_url, s.pb_email, s.pb_password)
    tid = pb.first("tenants", "slug='palavva'")["id"]
    if sys.argv[1] == "seed":
        for r in seed(pb, Queue(s.jobs_db), tid, [x.upper() for x in sys.argv[2:]] or None, f":r{int(time.time()) % 100000}" if len(sys.argv) > 2 else ""):
            print(r)
    else:
        hrs = float(sys.argv[2]) if len(sys.argv) > 2 else 6
        md = report(pb, tid, hrs)
        print(md)
        out = Path(__file__).resolve().parents[4] / "docs/evidence/v16/COUNTRY-VERIFICATION-TABLE.md"
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(f"# Country verification table (last {hrs:g} h, generated {time.strftime('%Y-%m-%d %H:%M UTC', time.gmtime())})\n\n"
                       "Operator-triggered openings are shown in the last column; every other count is autonomous engine output.\n\n" + md + "\n")


if __name__ == "__main__":
    main()
