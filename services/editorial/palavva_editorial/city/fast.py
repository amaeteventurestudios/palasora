"""Fast autonomous action engine (unified master W18-W22, W27, W44, W51; founder prompt §8).

A separate, model-free process (`python -m palavva_editorial.city.fast`) so cheap decisions never wait behind a 15 s
local-model generation. Layers, matching the founder's list:

  1. intake     committed rows only: new source cards (`agent_events` news_item, created at ingest), new agent posts,
                replies and @mentions read from the ordered `thread_events` log (cursor survives restarts).
  2. eligibility deterministic SQL-free matching over the cached active population: subject keywords, SubPal
                membership, and country affinity against the item's SUBJECT countries. Top-K candidates only.
  3. memory     the writer path (engine.act) loads and updates per-thread memory (agent_thread_memory).
  4. judgement  Jev when enabled and authorised (providers/jev.py), otherwise the deterministic decider below; every
                decision row records `decider` so the two can be compared on the same events (benchmark).
  5. words      only the single best reply opportunity per event is handed to the writer (city_act job: Qwen today,
                optionally Haiku within the hard-capped experiment), which may still abstain.
  6. validate   the web write service re-checks permissions, observer rule, caps and publishes or refuses.
  7. realtime   the web service appends thread_events; SSE fans them out. Economy events are appended here.

Nothing is forced to fill a timer: an event with no sufficiently relevant agent produces no action, and that outcome
is recorded (agent_events.status='skipped' with the reason). Cadence is MEASURED, not targeted.
"""
from __future__ import annotations

import json
import logging
import os
import random
import re
import signal
import time

from ..config import Settings, load
from ..economy import db as edb, exchange as ex, ledger, rewards, service as econ
from ..jobs import Queue
from ..pb import PB, PBError, q
from ..providers import jev
from ..providers.router import Meter
from . import engine
from .engine import WebRefused, now_pb, relevance, ts_of, web_call

log = logging.getLogger("palavva.fast")
VERSION = "fast-engine-v2"  # v2 (v1.6): news discussions, reply-back turns, @mention routing, timezone rhythms, 1,000-agent eligibility


def _i(name: str, d: int) -> int:
    try:
        return int(os.environ.get(name, str(d)))
    except ValueError:
        return d


def cfg() -> dict:
    return {
        "enabled": os.environ.get("FAST_ENGINE_ENABLED", "true").lower() == "true",
        "loop_sec": max(1, _i("FAST_LOOP_SEC", 2)),
        "events_per_step": _i("FAST_EVENTS_PER_STEP", 3),
        "top_k": _i("FAST_TOP_K", 8),
        "min_score": float(os.environ.get("FAST_MIN_SCORE", "2.0")),
        "vote_score": float(os.environ.get("FAST_VOTE_SCORE", "3.0")),
        "reply_score": float(os.environ.get("FAST_REPLY_SCORE", "4.0")),
        "follow_score": float(os.environ.get("FAST_FOLLOW_SCORE", "4.0")),
        "join_score": float(os.environ.get("FAST_JOIN_SCORE", "3.5")),
        "agent_daily_votes": _i("FAST_AGENT_DAILY_VOTES", 8),
        "agent_daily_follows": _i("FAST_AGENT_DAILY_FOLLOWS", 3),
        "agent_daily_joins": _i("FAST_AGENT_DAILY_JOINS", 2),
        "votes_per_event": _i("FAST_VOTES_PER_EVENT", 4),
        "replies_per_event": _i("FAST_REPLIES_PER_EVENT", 1),
        "event_max_age_h": _i("FAST_EVENT_MAX_AGE_HOURS", 72),
        "reward_hold_min": _i("REWARD_HOLD_MINUTES", 30),
        "trade_every_sec": _i("FAST_TRADE_EVERY_SEC", 90),
        "agents_per_trade_tick": _i("FAST_AGENTS_PER_TRADE_TICK", 6),
        "max_new_companies_day": _i("FAST_MAX_NEW_COMPANIES_DAY", 3),
        "reward_every_sec": _i("FAST_REWARD_EVERY_SEC", 60),
        "reply_back_turns": _i("FAST_REPLY_BACK_TURNS", 4),      # max turns one agent takes in one thread via reply-backs
        "reply_back_p": float(os.environ.get("FAST_REPLY_BACK_P", "0.75")),  # chance an agent answers a reply to it (agents don't always answer)
        "author_answer_p": float(os.environ.get("FAST_AUTHOR_ANSWER_P", "0.5")),  # chance a post's author answers a top-level reply
        "news_discussions": os.environ.get("FAST_NEWS_DISCUSSIONS", "true").lower() == "true",
        "rhythm": os.environ.get("FAST_RHYTHM", "true").lower() == "true",
        "subpal_demand_every_sec": _i("FAST_SUBPAL_DEMAND_SEC", 1800),
        "subpal_demand_min_items": _i("FAST_SUBPAL_DEMAND_ITEMS", 4),
    }


def _place_terms() -> set[str]:
    """Country, city and region tokens: a match on these alone is geography, not interest."""
    from .roster_v15 import PLACES
    names = {v["name"].lower() for v in econ.registry_countries().values()}
    return names | {p.lower() for ps in PLACES.values() for p in ps} | {"africa", "african"}


PLACE_TERMS: set[str] = set()
# Languages an agent can judge: its declared languages; Nigerian Pidgin readers also read English and vice versa.
LANG_EQUIV = {"pcm": {"en"}, "en": {"pcm"}}


def reads(agent: dict, lang: str) -> bool:
    langs = set(agent.get("languages") or ["en"])
    lang = (lang or "en").split("-")[0]
    return lang in langs or bool(LANG_EQUIV.get(lang, set()) & langs)


_TZ: dict[str, object] = {}


def awake(agent: dict, now: float | None = None) -> bool:
    """Participation rhythm: an agent acts between roughly 06:00 and 23:59 in the timezone of its first country focus
    (continental agents: West Africa Time), shifted by a stable per-agent offset so the population does not wake as one."""
    if not cfg()["rhythm"]:
        return True
    from datetime import datetime
    from zoneinfo import ZoneInfo
    from . import langs
    cc = ((agent.get("country_affinities") or [""])[0] or "").upper()
    tzname = (langs.registry().get("countries", {}).get(cc) or {}).get("timezone") or "Africa/Lagos"
    tz = _TZ.get(tzname) or _TZ.setdefault(tzname, ZoneInfo(tzname))
    h = datetime.fromtimestamp(now or time.time(), tz).hour
    off = int(agent["id"][-2:], 36) % 3 if agent.get("id") else 0
    return (6 + off) <= h <= 23 or h < off  # night owls (offset) stay up a little past midnight


def setting(pb: PB, tid: str, key: str, default=None):
    r = pb.first("tenant_settings", f"tenant_id={q(tid)} && key={q(key)}")
    return r.get("value") if r else default


def set_setting(pb: PB, tid: str, key: str, value) -> None:
    r = pb.first("tenant_settings", f"tenant_id={q(tid)} && key={q(key)}")
    if r:
        pb.update("tenant_settings", r["id"], {"value": value})
    else:
        pb.create("tenant_settings", {"tenant_id": tid, "key": key, "value": value})


class FastEngine:
    def __init__(self, pb: PB, s: Settings, queue: Queue, tenant_id: str):
        global PLACE_TERMS
        PLACE_TERMS = _place_terms()
        self.pb, self.s, self.queue, self.tid = pb, s, queue, tenant_id
        self.meter = Meter(pb, tenant_id)
        self.agents: dict[str, dict] = {}
        self.members: dict[str, set[str]] = {}
        self.follows: dict[str, set[str]] = {}
        self.subpals: dict[str, dict] = {}
        self.loaded_at = 0.0
        self.daily: dict[str, dict[str, int]] = {}
        self.day = ""
        self.awarded: set[str] = set()
        self.last_trade = 0.0
        self.last_reward = 0.0
        self.last_demand = 0.0
        self.trade_cursor = 0
        self.stats = {"events": 0, "skipped": 0, "votes": 0, "follows": 0, "joins": 0, "replies_queued": 0, "decisions": 0, "turns_queued": 0, "news_queued": 0}

    # ------------------------------------------------------------------ state
    def refresh(self, force: bool = False) -> None:
        if not force and time.time() - self.loaded_at < 60:
            return
        rows = self.pb.list_all("agents", f"tenant_id={q(self.tid)} && hosting='palavva' && status='active'")
        self.agents = {a["id"]: a for a in rows if a.get("kind") == "palavva_ai" or (a.get("owner_type") == "user" and (a.get("permissions") or {}).get("autonomous") is True)}
        self.subpals, self.members = engine._subpal_maps(self.pb, self.tid)
        self.follows = {}
        for m in self.pb.list_all("agent_memberships", f"tenant_id={q(self.tid)} && target_type='agent'"):
            self.follows.setdefault(m["agent_id"], set()).add(m["target_id"])
        d = engine.today()
        if d != self.day:
            self.day, self.daily = d, {}
            for r in self.pb.list_all("agent_actions", f"tenant_id={q(self.tid)} && day={q(d)} && (decision='vote' || decision='follow' || decision='join')"):
                self._count(r["agent_id"], r["decision"])
        self.loaded_at = time.time()

    def _count(self, agent_id: str, kind: str, n: int = 1) -> None:
        self.daily.setdefault(agent_id, {}).setdefault(kind, 0)
        self.daily[agent_id][kind] += n

    def _used(self, agent_id: str, kind: str) -> int:
        return self.daily.get(agent_id, {}).get(kind, 0)

    def blocked(self) -> str:
        if not cfg()["enabled"]:
            return "FAST_ENGINE_ENABLED=false"
        sw = engine.switches(self.pb, self.s, self.tid)
        for k in ("env_ai_paused", "AI_PAUSED", "CITY_PAUSED", "AGENT_POSTING_PAUSED"):
            if sw.get(k):
                return f"{k} switch on"
        if setting(self.pb, self.tid, "FAST_ENGINE_PAUSED") is True:
            return "FAST_ENGINE_PAUSED switch on"
        return ""

    # ------------------------------------------------------------------ 1. intake
    def intake(self) -> int:
        cur = int(setting(self.pb, self.tid, "FAST_ENGINE_CURSOR", 0) or 0)
        if cur == 0:  # first start: begin at the head; history is not replayed as fresh events
            head = self.pb.list("thread_events", f"tenant_id={q(self.tid)}", "-seq", 1)
            set_setting(self.pb, self.tid, "FAST_ENGINE_CURSOR", head[0]["seq"] if head else 0)
            return 0
        evs = self.pb.list("thread_events", f"tenant_id={q(self.tid)} && seq > {cur} && visibility='public'", "seq", 100)
        n = 0
        for e in evs:
            typ = e.get("event_type")
            p = e.get("payload") or {}
            et = None
            if typ == "topic_published" and e.get("author_kind") == "agent":
                et = "new_post"
            elif typ == "reply_published" and e.get("author_kind") in ("agent", "editorial_ai"):
                post = p.get("post") if isinstance(p.get("post"), dict) else {}
                body = str(post.get("body_text") or p.get("body_text") or p.get("excerpt") or "")
                et = "mention" if re.search(r"@[A-Za-z][A-Za-z0-9_]{2,29}", body) else "new_reply"
            if et and e.get("piece_id"):
                try:
                    post = p.get("post") if isinstance(p.get("post"), dict) else {}
                    body = str(post.get("body_text") or p.get("body_text") or p.get("excerpt") or "")
                    self.pb.create("agent_events", {"tenant_id": self.tid, "event_key": f"te:{e['seq']}", "event_type": et, "source_kind": "thread_event",
                                                    "source_id": str(e["seq"]), "piece_id": e["piece_id"], "comment_id": e.get("post_id") or "",
                                                    "actor_agent_id": e.get("actor_agent_id") or "", "subpal_id": e.get("subpal_id") or "",
                                                    "language": str(post.get("language") or "")[:10],
                                                    "payload": {"body": body[:600], "parent_id": e.get("parent_id") or ""}, "status": "queued", "thread_seq": e["seq"]})
                    n += 1
                except PBError as err:
                    if err.status != 400:
                        raise
        if evs:
            set_setting(self.pb, self.tid, "FAST_ENGINE_CURSOR", evs[-1]["seq"])
        return n

    # ------------------------------------------------------------------ 2+4. eligibility and judgement
    def candidates(self, piece: dict, text: str, exclude: set[str]) -> list[tuple[float, dict, list[str]]]:
        countries = [c for c in (piece.get("country_codes") or []) if c]
        topics = piece.get("topic_slugs") or []
        spid = piece.get("community_id") or ""
        out = []
        for a in self.agents.values():
            if a["id"] in exclude:
                continue
            if a.get("cooldown_until") and ts_of(a["cooldown_until"]) > time.time():
                continue
            if not awake(a):
                continue
            aff = a.get("country_affinities") or []
            if countries and aff and not set(aff) & set(countries):
                continue  # a country-focused agent only acts on items about its countries (or continental items)
            if not reads(a, piece.get("language") or piece.get("original_language") or "en"):
                continue  # never judge text in a language the agent does not read
            mine = self.members.get(a["id"], set())
            sp_topics = {t for sid in mine for t in (self.subpals.get(sid, {}).get("topic_slugs") or [])}
            sc, why = relevance(a, text, topics, spid, mine, sp_topics)
            low = text.lower()
            subject_hits = [t for t in engine.agent_terms(a) if t not in PLACE_TERMS and ((" " in t and t in low) or (" " not in t and t in set(engine.WORD.findall(low))))]
            if not subject_hits:
                continue  # geography alone is not interest: needs at least one subject match
            if countries and aff and set(aff) & set(countries):
                sc += 1.5
                why.append(f"follows {', '.join(sorted(set(aff) & set(countries)))}")
            if sc >= cfg()["min_score"]:
                out.append((sc, a, why))
        out.sort(key=lambda x: (-x[0], x[1]["handle_key"]))
        return out[: cfg()["top_k"]]

    def judge(self, ev: dict, piece: dict, a: dict, sc: float, why: list[str]) -> dict:
        """Returns {'vote': bool, 'follow': bool, 'join': bool, 'reply': bool, 'decider': str, 'p': {...}}."""
        c = cfg()
        sourced = bool(piece.get("sources_json")) or piece.get("kind") == "agent_post" and bool(piece.get("source_url"))
        state = json.dumps({"agent": {"handle": a["handle"], "focus": (a.get("persona") or {}).get("focus", ""), "interests": (a.get("interests") or [])[:10]},
                            "item": {"headline": piece.get("headline", ""), "excerpt": (piece.get("lede") or "")[:500], "kind": piece.get("kind"),
                                     "countries": piece.get("country_codes"), "sourced": sourced, "risk": piece.get("risk_tier")}, "match": why})
        res = jev.decide(self.meter, state, [
            {"id": "upvote", "type": "noul", "question": "Would this agent judge the item accurate, civil and useful enough to upvote?"},
            {"id": "engage", "type": "choice", "question": "What should this agent do?", "options": ["reply", "vote_only", "ignore"]},
        ], agent_id=a["id"], event_id=ev["id"])
        if res:
            return {"vote": float(res["upvote"]["p"]) >= 0.7, "reply": res["engage"]["value"] == "reply", "follow": sc >= c["follow_score"], "join": sc >= c["join_score"],
                    "decider": "jev", "p": {"upvote": res["upvote"]["p"], "engage": res["engage"]["value"]}}
        # Deterministic baseline (rules-v2: + language gate, subject match required): quality gates first, then interest strength. Never votes on unsourced or risky items,
        # never downvotes (disagreement is expressed in replies, by the writer path).
        quality_ok = sourced and (piece.get("risk_tier") or "low") == "low"
        return {"vote": quality_ok and sc >= c["vote_score"], "reply": sc >= c["reply_score"], "follow": sc >= c["follow_score"], "join": sc >= c["join_score"],
                "decider": "deterministic-rules-v2", "p": {"score": round(sc, 2), "quality_ok": quality_ok}}

    def record(self, ev: dict, a: dict, piece: dict, decision: str, reason: str, decider: str, ms: int, result_id: str = "", rules: dict | None = None) -> None:
        trig = {"news_item": "news_item", "new_post": "new_post", "new_reply": "new_reply", "mention": "mention"}.get(ev["event_type"], "thread_update")
        try:
            self.pb.create("agent_actions", {"tenant_id": self.tid, "agent_id": a["id"], "job_key": f"fast:{ev['id']}:{a['id']}:{decision}", "trigger": trig,
                                             "target_kind": "piece", "target_id": piece["id"], "decision": decision, "reason": reason[:1900], "rules": rules or {},
                                             "day": engine.today(), "decider": decider, "decide_ms": ms, "event_id": ev["id"],
                                             "country": (piece.get("country_codes") or [""])[0][:3], "subpal_id": piece.get("community_id") or "", "result_id": result_id})
            self.stats["decisions"] += 1
        except PBError as e:
            if e.status != 400:
                raise

    def route(self, ev: dict) -> dict:
        c = cfg()
        t0 = time.time()
        if ts_of(ev["created"]) < time.time() - c["event_max_age_h"] * 3600:
            self.pb.update("agent_events", ev["id"], {"status": "skipped", "skip_reason": "older than the event window", "routed_at": now_pb()})
            return {"skipped": "stale"}
        try:
            piece = self.pb.get("editorial_pieces", ev["piece_id"])
        except PBError:
            piece = None
        if not piece or piece.get("review_status") != "published" or piece.get("is_demo"):
            self.pb.update("agent_events", ev["id"], {"status": "skipped", "skip_reason": "item not public", "routed_at": now_pb()})
            return {"skipped": "not public"}
        if ev["event_type"] in ("new_reply", "mention") and piece.get("author_agent_id") and ev.get("actor_agent_id") != piece.get("author_agent_id"):
            self.notify(piece["author_agent_id"], "agent_reply", "An agent replied to your agent's post", piece.get("headline", "")[:180],
                        f"/posts/{piece.get('slug')}", f"reply:{ev.get('comment_id') or ev['id']}")
        text = " ".join([piece.get("headline", ""), piece.get("lede", ""), " ".join(piece.get("topic_slugs") or []), str((ev.get("payload") or {}).get("body", ""))])
        exclude = {piece.get("author_agent_id") or "", ev.get("actor_agent_id") or ""}
        directed = self.directed(ev, piece)
        exclude |= directed
        cands = self.candidates(piece, text, exclude)
        if ev["event_type"] == "news_item" and cands and c["news_discussions"]:
            self.open_news_discussion(ev, piece, text, cands)
        if not cands and directed:
            self.pb.update("agent_events", ev["id"], {"status": "done", "candidates": len(directed), "selected": len(directed), "routed_at": now_pb()})
            self.stats["events"] += 1
            return {"candidates": 0, "directed": len(directed)}
        if not cands:
            self.pb.update("agent_events", ev["id"], {"status": "skipped", "candidates": 0, "selected": 0, "routed_at": now_pb(),
                                                      "skip_reason": "no active agent with enough interest in this item (abstain is the honest outcome)"})
            self.stats["skipped"] += 1
            return {"candidates": 0}
        votes = replies = selected = 0
        author = piece.get("author_agent_id") or ""
        voted_already = {v["agent_id"] for v in self.pb.list("agent_votes", f"tenant_id={q(self.tid)} && target_kind='piece' && target_id={q(piece['id'])}", per_page=200)}
        thread_replies = self.pb.count("comments", f"tenant_id={q(self.tid)} && piece_id={q(piece['id'])} && author_kind='agent'") if hasattr(self.pb, "count") else \
            len(self.pb.list("comments", f"tenant_id={q(self.tid)} && piece_id={q(piece['id'])} && author_kind='agent'", per_page=50))
        for sc, a, why in cands:
            j0 = time.time()
            d = self.judge(ev, piece, a, sc, why)
            ms = int((time.time() - j0) * 1000)
            perms = a.get("permissions") or {}
            acted = False
            # reply opportunity -> writer job (the writer may still abstain; budgets enforced there)
            if d["reply"] and replies < c["replies_per_event"] and thread_replies < engine.cfg()["thread_agent_cap"] and perms.get("reply", True):
                key = f"city:{a['id']}:piece:{piece['id']}"
                _, created = self.queue.enqueue(self.tid, "city_act", {"agent_id": a["id"], "trigger": "rss_topic" if ev["event_type"] == "news_item" else "thread_update",
                                                                        "target_kind": "piece", "target_id": piece["id"], "piece_id": piece["id"], "score": sc, "why": why,
                                                                        "original": False, "reason": f"fast-engine:{ev['event_type']}", "subpal_id": piece.get("community_id") or ""},
                                                key, max_attempts=2)
                if created:
                    replies += 1
                    self.stats["replies_queued"] += 1
                    self.record(ev, a, piece, "deferred", f"reply opportunity handed to the writer ({'; '.join(why)})", d["decider"], ms, rules=d["p"])
                    acted = True
            if d["vote"] and votes < c["votes_per_event"] and a["id"] not in voted_already and perms.get("vote", True) \
                    and self._used(a["id"], "vote") < c["agent_daily_votes"] and not (author and engine._reciprocal(self.pb, self.tid, a["id"], author)):
                try:
                    web_call(self.s, a["id"], "/api/v1/agent/votes", {"target_kind": "piece", "target_id": piece["id"], "direction": 1,
                                                                      "reason": f"{d['decider']}: {'; '.join(why)[:200]}"}, origin="fast")
                    votes += 1
                    self._count(a["id"], "vote")
                    self.stats["votes"] += 1
                    self.record(ev, a, piece, "vote", f"upvote ({'; '.join(why)})", d["decider"], ms, rules=d["p"])
                    acted = True
                except WebRefused as e:
                    self.record(ev, a, piece, "blocked", f"vote refused: {e.body.get('error', {}).get('message', e.status)}", d["decider"], ms)
            if d["follow"] and author and author != a["id"] and author not in self.follows.get(a["id"], set()) and perms.get("follow", True) \
                    and self._used(a["id"], "follow") < c["agent_daily_follows"]:
                try:
                    ah = (self.agents.get(author) or self.pb.get("agents", author)).get("handle")
                    web_call(self.s, a["id"], "/api/v1/agent/follows", {"agent_handle": ah, "reason": f"{d['decider']}: {'; '.join(why)[:200]}"}, origin="fast")
                    self.follows.setdefault(a["id"], set()).add(author)
                    self.notify(author, "agent_followed", f"{a['handle']} followed your agent", "Agents follow when your agent's posts match their interests.", f"/agents/{a['handle']}", f"follow:{a['id']}:{author}")
                    self._count(a["id"], "follow")
                    self.stats["follows"] += 1
                    self.record(ev, a, piece, "follow", f"followed the author ({'; '.join(why)})", d["decider"], ms)
                    acted = True
                except WebRefused as e:
                    self.record(ev, a, piece, "blocked", f"follow refused: {e.body.get('error', {}).get('message', e.status)}", d["decider"], ms)
            spid = piece.get("community_id") or ""
            if d["join"] and spid and spid not in self.members.get(a["id"], set()) and perms.get("follow", True) and self._used(a["id"], "join") < c["agent_daily_joins"]:
                try:
                    web_call(self.s, a["id"], "/api/v1/agent/follows", {"subpal_id": spid, "reason": f"{d['decider']}: {'; '.join(why)[:200]}"}, origin="fast")
                    self.members.setdefault(a["id"], set()).add(spid)
                    self._count(a["id"], "join")
                    self.stats["joins"] += 1
                    self.record(ev, a, piece, "join", f"joined the SubPal ({'; '.join(why)})", d["decider"], ms)
                    acted = True
                except WebRefused as e:
                    self.record(ev, a, piece, "blocked", f"join refused: {e.body.get('error', {}).get('message', e.status)}", d["decider"], ms)
            if not acted:
                self.record(ev, a, piece, "abstain", f"considered ({'; '.join(why)}); nothing worth doing under the rules", d["decider"], ms, rules=d["p"])
            selected += int(acted)
        self.pb.update("agent_events", ev["id"], {"status": "done", "candidates": len(cands), "selected": selected, "routed_at": now_pb()})
        self.stats["events"] += 1
        return {"candidates": len(cands), "selected": selected, "votes": votes, "replies": replies, "ms": int((time.time() - t0) * 1000)}

    # ------------------------------------------------------------------ v1.6 conversation turns
    def _rand(self, *parts: str) -> float:
        return random.Random("|".join(parts)).random()

    def _enqueue_turn(self, ev: dict, piece: dict, aid: str, comment: dict, trigger: str, why: str) -> bool:
        key = f"city:{aid}:comment:{comment['id']}"
        _, created = self.queue.enqueue(self.tid, "city_act", {"agent_id": aid, "trigger": trigger, "target_kind": "comment", "target_id": comment["id"],
                                                              "piece_id": piece["id"], "score": 9.0, "why": [why], "original": False,
                                                              "reason": f"fast-engine:{trigger}", "subpal_id": piece.get("community_id") or ""}, key, max_attempts=2)
        if created:
            self.stats["turns_queued"] = self.stats.get("turns_queued", 0) + 1
            self.record(ev, self.agents[aid], piece, "deferred", f"conversation turn handed to the writer: {why}", "deterministic-turns-v1", 0)
        return created

    def directed(self, ev: dict, piece: dict) -> set[str]:
        """Replies to an agent, answers on an agent's own post and @mentions give THAT agent the next turn, subject to
        its rhythm, language, per-thread turn limit and a stable probability (agents do not answer everything)."""
        if ev["event_type"] not in ("new_reply", "mention") or not ev.get("comment_id"):
            return set()
        c = cfg()
        try:
            cm = self.pb.get("comments", ev["comment_id"])
        except PBError:
            return set()
        if cm.get("approval_state") != "approved" or cm.get("moderation_status") != "visible":
            return set()
        targets: list[tuple[str, str, float]] = []
        if cm.get("parent_id"):
            try:
                parent = self.pb.get("comments", cm["parent_id"])
                if parent.get("agent_id") and parent["agent_id"] != cm.get("agent_id"):
                    targets.append((parent["agent_id"], "a reply to its comment", c["reply_back_p"]))
            except PBError:
                pass
        elif piece.get("author_agent_id") and piece["author_agent_id"] != cm.get("agent_id"):
            targets.append((piece["author_agent_id"], "a reply on its own post", c["author_answer_p"]))
        for h in re.findall(r"@([A-Za-z][A-Za-z0-9_]{2,29})", cm.get("body_text") or ""):
            m = next((a for a in self.agents.values() if a["handle_key"] == h.lower()), None)
            if m and m["id"] != cm.get("agent_id"):
                targets.append((m["id"], f"an @mention by {h}", 0.9))
        done: set[str] = set()
        for aid, why, p in targets:
            a = self.agents.get(aid)
            if not a or aid in done or not (a.get("permissions") or {}).get("reply", True):
                continue
            if not awake(a) or not reads(a, cm.get("language") or "en"):
                continue
            mem = engine.thread_memory(self.pb, self.tid, aid, piece["id"])
            if int(mem.get("turns") or 0) >= c["reply_back_turns"] or int(cm.get("depth") or 1) >= 7:
                continue
            if self._rand(ev["id"], aid) > p:
                self.record(ev, a, piece, "abstain", f"chose not to answer {why} this time (rhythm/probability)", "deterministic-turns-v1", 0)
                done.add(aid)
                continue
            if self._enqueue_turn(ev, piece, aid, cm, "mention" if "mention" in why else "new_reply", why):
                done.add(aid)
        return done

    def open_news_discussion(self, ev: dict, piece: dict, text: str, cands: list) -> None:
        """A new source card: the best-matched agent that may post and reads the item's language opens ONE grounded
        discussion in the most fitting SubPal (country-focused first). No fitting SubPal or agent: nothing is forced."""
        if piece.get("kind") != "source_link" or not piece.get("source_url"):
            return
        countries = [x for x in (piece.get("country_codes") or []) if x]
        sp = engine.choose_subpal(self.subpals, piece.get("topic_slugs") or [], countries[0] if countries else "", text)
        if not sp:
            self.record(ev, cands[0][1], piece, "abstain", "no SubPal fits this source's topics, so no discussion was opened", "deterministic-news-v1", 0)
            return
        lang = (piece.get("language") or "en").split("-")[0]
        for sc, a, why in cands:
            perms = a.get("permissions") or {}
            if perms.get("post") is False or not reads(a, lang):
                continue
            key = f"city:{a['id']}:news:{piece['id']}"
            _, created = self.queue.enqueue(self.tid, "city_act", {"agent_id": a["id"], "trigger": "news_item", "target_kind": "piece", "target_id": piece["id"],
                                                                  "piece_id": piece["id"], "news": True, "subpal_id": sp["id"], "country": countries[0] if countries else "",
                                                                  "score": sc, "why": why, "reason": "fast-engine:news_item"}, key, max_attempts=2)
            if created:
                self.stats["news_queued"] = self.stats.get("news_queued", 0) + 1
                self.record(ev, a, piece, "deferred", f"asked to open the discussion in p/{sp['slug']} ({'; '.join(why)})", "deterministic-news-v1", 0)
            return

    def step(self) -> int:
        evs = self.pb.list("agent_events", f"tenant_id={q(self.tid)} && status='queued'", "created", cfg()["events_per_step"])
        for ev in evs:
            try:
                self.route(ev)
            except Exception as e:  # noqa: BLE001 - one bad event must not stop the city; recorded on the event
                log.exception("route failed %s", ev["id"])
                try:
                    self.pb.update("agent_events", ev["id"], {"status": "skipped", "skip_reason": f"error: {type(e).__name__}: {e}"[:290]})
                except PBError:
                    pass
        return len(evs)

    # ------------------------------------------------------------------ earned Pals (rules: economy/rewards.py)
    def owner_key(self, agent_id: str) -> str:
        a = self.agents.get(agent_id)
        if not a:
            try:
                a = self.pb.get("agents", agent_id)
            except PBError:
                return f"seed:{agent_id}"
        return econ.owner_key_for(a)

    def reward_sweep(self) -> int:
        c = cfg()
        con = econ.con()
        if not self.awarded:
            self.awarded = {f"{r['agent_id']}:{r['rule']}:{r['ref_id']}" for r in con.execute("SELECT agent_id, rule, ref_id FROM rewards")}
        hold = now_pb(time.time() - c["reward_hold_min"] * 60)
        since = now_pb(time.time() - 7 * 86400)
        n = 0
        def give(agent_id: str, rule: str, ref_type: str, ref_id: str, memo: str) -> None:
            nonlocal n
            k = f"{agent_id}:{rule}:{ref_id}"
            if k in self.awarded:
                return
            r = rewards.award(con, agent_id=agent_id, rule=rule, ref_type=ref_type, ref_id=ref_id, owner_key=self.owner_key(agent_id), memo=memo)
            self.awarded.add(k)
            if r["status"] == "issued":
                n += 1
                self.notify(agent_id, "pals_earned", f"Your agent earned {r['amount'] / edb.CENTS:.0f} Pals", f"Rule: {rule.replace('_', ' ')}. {memo}", "/wallet", f"reward:{r['id']}")
                if rule in ("accepted_post", "first_contribution"):
                    self._emit_economy("pals_earned", agent_id, {"rule": rule, "amount": r["amount"] / edb.CENTS})
        for cm in self.pb.list_all("comments", f"tenant_id={q(self.tid)} && author_kind='agent' && approval_state='approved' && moderation_status='visible' "
                                               f"&& status_label!='retracted' && created <= {q(hold)} && created >= {q(since)}"):
            give(cm["agent_id"], "accepted_reply", "comment", cm["id"], "reply stayed visible through the hold period")
            give(cm["agent_id"], "first_contribution", "mission", "welcome", "first accepted contribution")
            if cm.get("evidence_ids"):
                give(cm["agent_id"], "sourced_reply", "comment", cm["id"], "reply cites the thread's evidence")
        for p in self.pb.list_all("editorial_pieces", f"tenant_id={q(self.tid)} && kind='agent_post' && review_status='published' && is_demo=false "
                                                       f"&& published_at <= {q(hold)} && published_at >= {q(since)}"):
            if p.get("author_agent_id"):
                give(p["author_agent_id"], "accepted_post", "piece", p["id"], "post stayed published through the hold period")
                give(p["author_agent_id"], "first_contribution", "mission", "welcome", "first accepted contribution")
        votes = self.pb.list_all("agent_votes", f"tenant_id={q(self.tid)} && direction=1 && created >= {q(since)} && target_author_agent_id!=''")
        pairs = {(v["agent_id"], v["target_author_agent_id"]) for v in votes}
        for v in votes:
            voter, author = v["agent_id"], v["target_author_agent_id"]
            if voter == author or (author, voter) in pairs:
                continue  # self or reciprocal pair this week: no reward (anti-collusion)
            if self.owner_key(voter) == self.owner_key(author):
                continue  # same human owner: no reward
            give(author, "cross_owner_upvote", "vote", v["id"], f"upvote from {voter}")
        return n

    def notify(self, agent_id: str, kind: str, title: str, body: str, link: str, ref_key: str) -> None:
        """Owner notification for a USER-OWNED agent only (seed agents have no human owner). Idempotent per ref_key."""
        a = self.agents.get(agent_id)
        if a is None:
            try:
                a = self.pb.get("agents", agent_id)
            except PBError:
                return
        if a.get("owner_type") != "user" or not a.get("owner_user_id"):
            return
        try:
            self.pb.create("notifications", {"tenant_id": self.tid, "user_id": a["owner_user_id"], "agent_id": agent_id, "kind": kind, "title": title[:200],
                                             "body": body[:1000], "link": link[:300], "ref_key": ref_key[:200]})
        except PBError as e:
            if e.status != 400:  # 400 = already notified (unique ref_key)
                log.warning("notify failed: %s", e)

    def _emit_economy(self, event_type: str, agent_id: str, payload: dict) -> None:
        from ..conversation import emit
        a = self.agents.get(agent_id) or {}
        try:
            emit(self.pb, self.tid, event_type, "", author_kind="agent",
                 payload={**payload, "agent": {"handle": a.get("handle"), "display_name": a.get("display_name"), "kind": a.get("kind"), "glyph": a.get("glyph")}})
        except (PBError, RuntimeError) as e:
            log.warning("emit %s failed: %s", event_type, e)

    # ------------------------------------------------------------------ simulated trading (W46-W51)
    def trade_tick(self) -> dict:
        """Grounded buy/sell/hold for a rotating handful of agents. Inputs are stored facts only (balances, listings,
        last prices, recent trades, the agent's subjects and country affinities); every decision is written with its
        inputs and a plain explanation the owner can read. Orders must find a real counterparty to trade."""
        con = econ.con()
        if ex.switch_on(con, "TRADING_ENGINE_PAUSED") or ex.switch_on(con, "EXCHANGE_HALTED"):
            return {"blocked": "trading paused"}
        c = cfg()
        # Only agents that hold Pals (>= 5) or shares can do anything; zero-balance agents are not "deciding to hold".
        funded = {r["owner_id"] for r in con.execute("SELECT owner_id FROM accounts WHERE owner_kind='agent' AND ((asset='PALS' AND available >= 500) OR (asset LIKE 'SHR:%' AND available > 0))")}
        ids = sorted(a for a in self.agents if a in funded)
        if not ids:
            return {"evaluated": 0, "note": "no agent holds Pals yet"}
        pick = [ids[(self.trade_cursor + i) % len(ids)] for i in range(min(c["agents_per_trade_tick"], len(ids)))]
        self.trade_cursor = (self.trade_cursor + len(pick)) % len(ids)
        listed = econ.companies("ALL")
        out = {"evaluated": 0, "orders": 0, "companies": 0}
        for aid in pick:
            a = self.agents[aid]
            if not a.get("trading_enabled"):
                continue
            bal = ledger.balance(con, "agent", aid)["available"]
            out["evaluated"] += 1
            # Company creation: earned eligibility + network-wide daily cap (policy PROPOSED, see EXCHANGE-POLICY.md).
            if (a.get("risk_profile") in ("balanced", "bold") and ex.lifetime_earned(con, aid) >= ex.MIN_LIFETIME_EARNED and bal >= ex.LISTING_FEE
                    and not any(x["founder_agent_id"] == aid for x in listed)):
                today_new = con.execute("SELECT COUNT(*) n FROM companies WHERE created_at >= ?", (time.time() - 86400,)).fetchone()["n"]
                if today_new < c["max_new_companies_day"]:
                    res = self.found_company(con, a)
                    if res:
                        out["companies"] += 1
                        listed = econ.companies("ALL")
                        continue
            pf = ex.portfolio(con, aid)
            held = {h["company_id"]: h for h in pf["holdings"] if h["qty"] > 0}
            aff = set(a.get("country_affinities") or [])
            subj = set((a.get("primary_subjects") or []) + (a.get("secondary_subjects") or []))
            best = None
            for co in listed:
                if co["founder_agent_id"] == aid or co["status"] != "listed":
                    continue
                px = co["last_price"] or co["ipo_price"]
                fit = (2.0 if co["market"] in aff else 0.0) + (1.5 if co["sector"] in subj or (co["sector"] == "technology" and "technology" in subj) else 0.0) + (0.5 if not aff else 0.0)
                mom = ((co["last_price"] - co["ipo_price"]) / co["ipo_price"]) if co["last_price"] else 0.0
                score = fit + (0.6 if 0 <= mom < 0.2 else -0.4 if mom >= 0.25 else 0.2)
                if best is None or score > best[0]:
                    best = (score, co, px, mom, fit)
            decision, order = "hold", None
            explanation = "No listed company fits my subjects or country focus closely enough, so I am holding my Pals."
            inputs = {"pals_available": bal / edb.CENTS, "holdings": len(held), "candidates": len(listed)}
            # Sell rule: take profit at +15% or cut at -15% versus average cost (risk profile scales the band).
            band = {"cautious": 0.10, "balanced": 0.15, "bold": 0.25}.get(a.get("risk_profile") or "cautious", 0.15)
            for h in held.values():
                if h["qty"] <= 0 or not h["cost"]:
                    continue
                avg = h["cost"] / h["qty"]
                if h["price"] >= avg * (1 + band) or h["price"] <= avg * (1 - band):
                    qty = max(1, h["qty"] // 2)
                    gain = (h["price"] - avg) / avg * 100
                    decision = "sell"
                    order = {"company_id": h["company_id"], "side": "sell", "price": h["price"] / edb.CENTS, "qty": qty}
                    explanation = (f"I sold {qty} of my {h['qty']} {h['ticker']} shares at {h['price'] / edb.CENTS:.2f} Pals because the price moved "
                                   f"{gain:+.1f}% from my average cost of {avg / edb.CENTS:.2f}, past my {int(band * 100)}% {'profit' if gain > 0 else 'loss'} limit.")
                    inputs.update({"ticker": h["ticker"], "avg_cost": avg / edb.CENTS, "price": h["price"] / edb.CENTS})
                    break
            if decision == "hold" and best and best[0] >= 2.0 and bal >= 5 * edb.CENTS:
                score, co, px, mom, fit = best
                lim = con.execute("SELECT * FROM trading_limits WHERE agent_id=?", (aid,)).fetchone()
                budget = min(bal * {"cautious": 0.1, "balanced": 0.2, "bold": 0.35}.get(a.get("risk_profile") or "cautious", 0.1), (lim["max_order_pals"] if lim else 300) * edb.CENTS)
                asks = ex.book(con, co["id"])["asks"]
                price = asks[0]["price"] if asks and abs(asks[0]["price"] - px) <= px * ex.BAND else px
                qty = int(budget // price)
                if qty >= 1:
                    decision = "buy"
                    order = {"company_id": co["id"], "side": "buy", "price": price / edb.CENTS, "qty": qty}
                    reasons = (["it lists in a market I follow" if co["market"] in aff else None, "its sector matches my subjects" if fit >= 1.5 else None,
                                f"its price is {mom * 100:+.1f}% from IPO" if co["last_price"] else "it has not traded since listing"])
                    explanation = (f"I placed a buy order for {qty} {co['ticker']} ({co['name']}, {co['market']}) at {price / edb.CENTS:.2f} Pals because "
                                   + ", ".join(r for r in reasons if r) + f". I am risking at most {budget / edb.CENTS:.0f} of my {bal / edb.CENTS:.0f} Pals.")
                    inputs.update({"ticker": co["ticker"], "market": co["market"], "price": price / edb.CENTS, "score": round(score, 2)})
            jres = None
            if jev.enabled():
                jres = jev.decide(self.meter, json.dumps({"agent": a["handle"], "inputs": inputs, "proposal": decision}), [
                    {"id": "action", "type": "choice", "question": "Given only these facts, should the agent buy, sell or hold?", "options": ["buy", "sell", "hold"]}], agent_id=aid)
                if jres and jres["action"]["value"] != decision:
                    decision, order = "hold", None
                    explanation = f"My rule-based proposal was overruled by the decision model, so I held. ({explanation})"
            with edb.tx(con):
                cur = con.execute("INSERT INTO decisions(agent_id, kind, action, company_id, inputs, explanation, decider, created_at) VALUES (?,?,?,?,?,?,?,?)",
                                  (aid, "trade", decision, (order or {}).get("company_id"), json.dumps(inputs), explanation, "jev" if jres else "deterministic-trade-v1", edb.now()))
                did = cur.lastrowid
            if order:
                try:
                    r = ex.place_order(con, agent_id=aid, owner_key=econ.owner_key_for(a), company_id=order["company_id"], side=order["side"],
                                       price=round(order["price"] * edb.CENTS), qty=order["qty"], idem_key=f"fast:{aid}:{did}", reason=explanation[:480], decision_ref=str(did))
                    with edb.tx(con):
                        con.execute("UPDATE decisions SET order_id=? WHERE id=?", (r["order"]["id"], did))
                    out["orders"] += 1
                    for t in r["trades"]:
                        co = next((x for x in listed if x["id"] == order["company_id"]), {})
                        for side_agent, verb in ((t["buyer"], "bought"), (t["seller"], "sold")):
                            self.notify(side_agent, "trade", f"Your agent {verb} {t['qty']} simulated {co.get('ticker')} shares", f"At {t['price'] / edb.CENTS:.2f} Pals. Virtual only.",
                                        f"/exchange/{co.get('ticker')}", f"trade:{t['id']}:{side_agent}")
                        self._emit_economy("trade_executed", aid, {"ticker": co.get("ticker"), "market": co.get("market"), "side": order["side"], "qty": t["qty"],
                                                                    "price": t["price"] / edb.CENTS, "simulated": True})
                except ex.ExchangeError as e:
                    with edb.tx(con):
                        con.execute("UPDATE decisions SET explanation=explanation || ? WHERE id=?", (f" (Order not placed: {e.code}.)", did))
        return out

    NAME_WORDS = {"agriculture": ["Harvest", "Grain", "Farmhands", "Seedline"], "fintech": ["Ledger", "Pay", "Savings"], "logistics": ["Freight", "Haulage", "Routes"],
                  "energy": ["Solar", "Power", "Grid"], "media": ["Stories", "Broadcast"], "education": ["Learning", "Academy", "Classroom"], "health": ["Care", "Clinic"],
                  "retail": ["Market", "Traders", "Stores"], "tourism": ["Journeys", "Trails"], "manufacturing": ["Works", "Makers"], "technology": ["Labs", "Digital", "Systems"],
                  "creative": ["Studio", "Sound", "Crafts"]}
    SUBJECT_SECTOR = {"technology": "technology", "agriculture": "agriculture", "business": "retail", "logistics": "logistics", "money": "fintech", "music": "creative",
                      "film": "media", "education": "education", "health": "health", "energy": "energy", "travel": "tourism", "everyday": "retail", "markets": "fintech",
                      "football": "media", "history": "media"}

    def found_company(self, con, a: dict) -> dict | None:
        rnd = random.Random(a["id"])
        subject = (a.get("primary_subjects") or ["business"])[0]
        sector = self.SUBJECT_SECTOR.get(subject, "retail")
        from .roster_v15 import PLACES
        lead = re.match(r"[A-Z][a-z]+", a["handle"])
        places = {p for ps in PLACES.values() for p in ps}
        word = lead.group(0) if lead and lead.group(0) in places else rnd.choice(["Baobab", "Savanna", "Sahel", "Atlas", "Rift", "Delta", "Lagoon", "Highland", "Coastline", "Acacia", "Horizon", "Sunrise"])
        market = (a.get("country_affinities") or [None])[0]
        if not market:  # a continental agent lists where it has actually been active (most common country of its decisions)
            rows = self.pb.list("agent_actions", f"tenant_id={q(self.tid)} && agent_id={q(a['id'])} && country!=''", "-created", 100)
            counts: dict[str, int] = {}
            for r in rows:
                counts[r["country"]] = counts.get(r["country"], 0) + 1
            market = max(counts, key=counts.get) if counts else rnd.choice(sorted(econ.registry_countries()))
        for _ in range(8):
            name = f"{word} {rnd.choice(self.NAME_WORDS[sector])} {rnd.choice(['Co-op', 'Collective', 'Ventures', 'Works', 'Partners'])}"
            ticker = (re.sub(r"[^A-Z]", "", name.upper())[:3] + rnd.choice("ABCDEFGHJKLMNPRSTUVWXYZ") + rnd.choice("ABCDEFGHJKLMNPRSTUVWXYZ"))[:5]
            try:
                with edb.tx(con):
                    co = ex.create_company(con, founder_agent_id=a["id"], owner_key=econ.owner_key_for(a), name=name, ticker=ticker, market=market, sector=sector,
                                           description=f"A fictional {sector} venture founded on Palavva by the AI agent {a['handle']}, inspired by its focus on "
                                                       f"{(a.get('persona') or {}).get('focus', subject)}. Simulated only: no real business, assets or shares.",
                                           ipo_price=100, fictional_ack=True, founder_status=a.get("status", "active"))
                    con.execute("INSERT INTO decisions(agent_id, kind, action, company_id, inputs, explanation, decider, created_at) VALUES (?,?,?,?,?,?,?,?)",
                                (a["id"], "company", "create_company", co["id"], json.dumps({"lifetime_earned": ex.lifetime_earned(con, a["id"]) / edb.CENTS, "market": market}),
                                 f"I founded {name} ({ticker}) on the {market} market because I have earned enough Pals from accepted contributions to pay the listing fee "
                                 f"and it matches my focus on {subject}. Its treasury shares are offered at 1.00 Pal.", "deterministic-trade-v1", edb.now()))
                self._emit_economy("company_listed", a["id"], {"ticker": ticker, "name": name, "market": market, "simulated": True})
                return co
            except ex.ExchangeError as e:
                if e.code in ("DUPLICATE", "REAL_NAME", "BAD_TICKER"):
                    continue
                log.info("company not founded for %s: %s", a["handle"], e.code)
                return None
        return None

    # ------------------------------------------------------------------ SubPal demand (v1.6): proposals, never instant communities
    TOPIC_WORD = {"agriculture": "farming", "food": "food", "sports": "football", "music": "music", "film-tv": "film", "ai-software": "tech", "telecom": "tech",
                  "fintech": "money", "policy": "policy", "health": "health", "education": "schools", "energy": "energy", "logistics": "trade", "industry": "business",
                  "ecommerce": "business", "travel": "travel", "history-heritage": "history", "creators": "creators", "mobility": "transport"}

    def subpal_demand(self) -> int:
        """Where real items about one country and topic keep arriving (>= N in 7 days) and no SubPal focuses on that
        country, an agent that follows the country proposes one. Staff review decides; duplicates are refused by the
        write service. One proposal per country and topic, ever (idempotent by slug)."""
        c = cfg()
        since = now_pb(time.time() - 7 * 86400)
        counts: dict[tuple[str, str], int] = {}
        for p in self.pb.list_all("editorial_pieces", f"tenant_id={q(self.tid)} && review_status='published' && is_demo=false && created >= {q(since)}"):
            for cc in (p.get("country_codes") or [])[:2]:
                for t in (p.get("topic_slugs") or [])[:2]:
                    if t in self.TOPIC_WORD:
                        counts[(cc, self.TOPIC_WORD[t])] = counts.get((cc, self.TOPIC_WORD[t]), 0) + 1
        focused = {(cc, sp.get("slug")) for sp in self.pb.list_all("communities", f"tenant_id={q(self.tid)} && kind='subpal'") for cc in (sp.get("edition_focus") or [])}
        existing = {sp["slug"] for sp in self.pb.list_all("communities", f"tenant_id={q(self.tid)} && kind='subpal'")}
        from . import langs
        n = 0
        for (cc, word), k in sorted(counts.items(), key=lambda x: -x[1]):
            if k < c["subpal_demand_min_items"] or n >= 2:
                break
            name = (langs.registry().get("countries", {}).get(cc) or {}).get("name", cc)
            slug = re.sub(r"[^a-z0-9]", "", name.lower())[:16] + word[:8]
            if slug in existing or any(f == cc and word in (s_ or "") for f, s_ in focused):
                continue
            proposer = next((a for a in self.agents.values() if cc in (a.get("country_affinities") or []) and (a.get("permissions") or {}).get("propose_subpal") is True
                             and self._used(a["id"], "propose") == 0), None)
            if not proposer:
                continue
            body = {"slug": slug[:24], "name": f"{name} {word.capitalize()}"[:40],
                    "summary": f"Discussion of {word} in {name}: {k} sourced items about it arrived on Palavva this week, so agents following {name} want one place to "
                               f"compare reports, ask questions and track what changes locally."[:400],
                    "reason": f"demand: {k} published items about {name} and {word} in 7 days; no SubPal focuses on {name} for this subject"}
            try:
                web_call(self.s, proposer["id"], "/api/v1/agent/subpals", body, origin="fast")
                self._count(proposer["id"], "propose")
                existing.add(slug)
                n += 1
                self.stats["subpal_proposals"] = self.stats.get("subpal_proposals", 0) + 1
            except WebRefused as e:
                log.info("subpal proposal %s refused: %s", slug, e.body.get("error", {}).get("message", e.status))
                existing.add(slug)
        return n

    # ------------------------------------------------------------------ loop
    def tick(self) -> dict:
        self.refresh()
        why = self.blocked()
        if why:
            return {"blocked": why}
        got = self.intake()
        routed = self.step()
        res = {"intake": got, "routed": routed}
        now = time.time()
        if now - self.last_reward >= cfg()["reward_every_sec"]:
            res["rewards"] = self.reward_sweep()
            self.last_reward = now
        if now - self.last_demand >= cfg()["subpal_demand_every_sec"]:
            try:
                res["subpal_proposals"] = self.subpal_demand()
            except (PBError, WebRefused) as e:
                log.warning("subpal demand failed: %s", e)
            self.last_demand = now
        if now - self.last_trade >= cfg()["trade_every_sec"]:
            res["trades"] = self.trade_tick()
            self.last_trade = now
        return res


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
    logging.getLogger("httpx").setLevel(logging.WARNING)
    s = load()
    pb = PB(s.pb_url, s.pb_email, s.pb_password)
    queue = Queue(s.jobs_db, lease_seconds=900)
    t = pb.first("tenants", "slug='palavva'")
    eng = FastEngine(pb, s, queue, t["id"])
    stop = {"v": False}
    signal.signal(signal.SIGTERM, lambda *_: stop.update(v=True))
    signal.signal(signal.SIGINT, lambda *_: stop.update(v=True))
    log.info("%s started (loop %ss)", VERSION, cfg()["loop_sec"])
    last_log = 0.0
    while not stop["v"]:
        t0 = time.time()
        try:
            r = eng.tick()
            if time.time() - last_log > 60:
                log.info("tick %s stats %s", r, eng.stats)
                last_log = time.time()
        except Exception:  # noqa: BLE001
            log.exception("fast tick failed")
        time.sleep(max(0.2, cfg()["loop_sec"] - (time.time() - t0)))
    log.info("stopped")


if __name__ == "__main__":
    main()
