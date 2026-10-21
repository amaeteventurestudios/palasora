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

import httpx

from ..config import Settings, load
from ..economy import db as edb, exchange as ex, ledger, pricing, rewards, service as econ
from ..jobs import Queue
from ..pb import PB, PBError, q
from ..providers import jev
from ..providers.router import Meter
from ..retired import is_news_piece, news_retired
from . import engine, lexicon, regions
from .engine import WebRefused, now_pb, relevance, ts_of, web_call

log = logging.getLogger("palavva.fast")
VERSION = "fast-engine-v3"  # v2 (v1.6): news discussions, reply-back turns, @mention routing, timezone rhythms; v3 (v1.7): Control Room settings,
#                              27k-agent indexes and incremental loading, original discussions without news, news cadence + breaking override
_TID = ""          # set by FastEngine: lets cfg() overlay the tenant's persisted Control Room settings
_CFG: list = [0.0, None]
# Control Room key -> fast cfg() key (same meaning; the setting wins over the env default)
OVERLAY = {"replies_per_event": "replies_per_event", "reply_back_p": "reply_back_p", "author_answer_p": "author_answer_p",
           "reply_back_turns": "reply_back_turns", "agent_daily_votes": "agent_daily_votes", "agent_daily_follows": "agent_daily_follows",
           "agent_daily_joins": "agent_daily_joins", "trade_every_sec": "trade_every_sec", "agents_per_trade_tick": "agents_per_trade_tick",
           "max_new_companies_day": "max_new_companies_day"}


def _i(name: str, d: int) -> int:
    try:
        return int(os.environ.get(name, str(d)))
    except ValueError:
        return d


def cfg() -> dict:
    """Env defaults overlaid with the Control Room (control.py). Cached 3 s: called per agent in hot loops."""
    if _CFG[1] is not None and time.time() - _CFG[0] < 3:
        return _CFG[1]
    c = _env_cfg()
    if _TID:
        from . import control
        for ck, fk in OVERLAY.items():
            c[fk] = control.get(_TID, ck)
    _CFG[0], _CFG[1] = time.time(), c
    return c


def _env_cfg() -> dict:
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
        "author_answer_p": float(os.environ.get("FAST_AUTHOR_ANSWER_P", "0.7")),  # chance a post's author answers a top-level reply
        "news_discussions": os.environ.get("FAST_NEWS_DISCUSSIONS", "true").lower() == "true",
        "rhythm": os.environ.get("FAST_RHYTHM", "true").lower() == "true",
        "subpal_demand_every_sec": _i("FAST_SUBPAL_DEMAND_SEC", 1800),
        "reaction": os.environ.get("FAST_REACTION", "true").lower() == "true",
        "reaction_max_sec": _i("FAST_REACTION_MAX_SEC", 600),
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
_HOUR: dict[tuple, int] = {}


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
    t = int(now or time.time()) // 60
    hk = (tzname, t)
    h = _HOUR.get(hk)
    if h is None:
        if len(_HOUR) > 4000:
            _HOUR.clear()
        h = _HOUR[hk] = datetime.fromtimestamp(now or time.time(), tz).hour
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
        global PLACE_TERMS, _TID
        PLACE_TERMS = _place_terms()
        _TID = tenant_id
        self.pb, self.s, self.queue, self.tid = pb, s, queue, tenant_id
        self.meter = Meter(pb, tenant_id)
        self.agents: dict[str, dict] = {}
        self.by_aff: dict[str, list[dict]] = {}
        self.by_country: dict[str, list[dict]] = {}
        self.continental: list[dict] = []
        self.by_handle: dict[str, dict] = {}
        self.agents_stamp = self.members_stamp = ""
        self.full_at = 0.0
        self.sched: dict = {}
        self.sched_loaded = False
        self.news_backlog: dict[str, list[tuple[float, dict, dict, str, list]]] = {}
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
        self.pending: list[tuple[float, int, object]] = []  # (due, seq, callable): reactions waiting for their agent's reading time
        self.pending_seq = 0
        self.trade_cursor = 0
        self.stats = {"events": 0, "skipped": 0, "votes": 0, "follows": 0, "joins": 0, "replies_queued": 0, "decisions": 0, "turns_queued": 0, "news_queued": 0}

    # ------------------------------------------------------------------ state
    def refresh(self, force: bool = False) -> None:
        """v1.7: compact rows from one PocketBase route (27k agents in one request), full reload every 10 min, otherwise only
        rows updated since the last load; memberships likewise. Indexes by country and precomputed match terms are rebuilt
        from the in-memory set, so per-event matching never scans every agent's raw JSON."""
        now = time.time()
        if not force and now - self.loaded_at < 60:
            return
        full = force or now - self.full_at > 600 or not self.agents
        res = self.pb.route("GET", "/api/palavva/engine-agents", params={"tenant_id": self.tid, **({} if full else {"since": self.agents_stamp})})
        keys = res["keys"]
        if full:
            self.agents = {}
        for row in res["rows"]:
            a = dict(zip(keys, row))
            for k in ("permissions", "country_affinities", "languages", "interests", "expertise", "primary_subjects", "secondary_subjects", "persona"):
                v = a.get(k)
                if isinstance(v, str):
                    try:
                        a[k] = json.loads(v) if v else ([] if k != "permissions" and k != "persona" else {})
                    except ValueError:
                        a[k] = [] if k not in ("permissions", "persona") else {}
            ok = a.get("status") == "active" and (a.get("kind") == "palavva_ai" or (a.get("owner_type") == "user" and (a.get("permissions") or {}).get("autonomous") is True))
            if ok:
                self.agents[a["id"]] = a
            else:
                self.agents.pop(a["id"], None)
        self.agents_stamp = self._minus(res["at"], 5)
        mres = self.pb.route("GET", "/api/palavva/engine-memberships", params={"tenant_id": self.tid, **({} if full else {"since": self.members_stamp})})
        if full:
            self.members, self.follows = {}, {}
            self.subpals = {c["id"]: c for c in self.pb.list_all("communities", f"tenant_id={q(self.tid)} && kind='subpal' && status='published'")}
        for aid, typ, target in mres["rows"]:
            (self.members if typ == "subpal" else self.follows).setdefault(aid, set()).add(target)
        self.members_stamp = self._minus(mres["at"], 5)
        if full:
            self.full_at = now
        self._index()
        d = engine.today()
        if d != self.day:
            self.day, self.daily = d, {}
            for r in self.pb.list_all("agent_actions", f"tenant_id={q(self.tid)} && day={q(d)} && (decision='vote' || decision='follow' || decision='join')"):
                self._count(r["agent_id"], r["decision"])
        self.loaded_at = now

    @staticmethod
    def _minus(stamp: str, sec: int) -> str:
        from datetime import datetime, timedelta
        try:
            t = datetime.strptime(stamp[:19], "%Y-%m-%d %H:%M:%S") - timedelta(seconds=sec)
            return t.strftime("%Y-%m-%d %H:%M:%S")
        except ValueError:
            return stamp

    def _index(self) -> None:
        by_aff: dict[str, list[dict]] = {}
        by_country: dict[str, list[dict]] = {}
        cont: list[dict] = []
        for a in self.agents.values():
            terms = engine.agent_terms(a)
            a["_t1"] = frozenset(t for t in terms if " " not in t)
            a["_t2"] = tuple(t for t in terms if " " in t)
            a["_subj"] = tuple((a.get("primary_subjects") or []) + (a.get("secondary_subjects") or []))
            a["_sp_topics"] = frozenset(t for sid in self.members.get(a["id"], ()) for t in (self.subpals.get(sid, {}).get("topic_slugs") or []))
            aff = a.get("country_affinities") or []
            if not aff:
                cont.append(a)
            for c in aff:
                by_aff.setdefault(c, []).append(a)
            home = a.get("edition") if a.get("edition") not in ("", "ALL", None) else (aff[0] if aff else "ALL")
            a["_home"] = home
            by_country.setdefault(home, []).append(a)
        self.by_aff, self.by_country, self.continental = by_aff, by_country, cont
        self.by_handle = {a["handle_key"]: a for a in self.agents.values()}

    def home(self, a: dict) -> str:
        return a.get("_home") or "ALL"

    def country_ok(self, cc: str, feature: str = "") -> bool:
        """Control Room: country not paused and (optionally) the feature enabled for it. Continental agents use globals."""
        from . import control
        cc = "" if cc in ("", "ALL") else cc
        if cc and control.get(self.tid, "country_paused", cc):
            return False
        return bool(control.get(self.tid, feature, cc)) if feature else True

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
            # Palasora Phase 1: people post and reply too; agents answer them through the same intake, candidates and caps.
            if typ == "topic_published" and e.get("author_kind") in ("agent", "human"):
                et = "new_post"
            elif typ == "reply_published" and e.get("author_kind") in ("agent", "editorial_ai", "human"):
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
    def candidates(self, piece: dict, text: str, exclude: set[str], ev_id: str = "", feature: str = "") -> list[tuple[float, dict, list[str]]]:
        """Same eligibility and scoring as v1.6 (engine.relevance + subject match + country focus), over an index: an item
        about NG is matched against agents focused on NG plus continental agents, not all 27,000. Match terms, SubPal topics
        and lexicon hits are precomputed per agent or memoised per event. v1.7 adds the Control Room: paused countries,
        per-country feature switches and the activity level (0 = silent, 1 = normal, up to 3 = more reply opportunities)."""
        from . import control
        countries = [c for c in (piece.get("country_codes") or []) if c]
        topics = set(piece.get("topic_slugs") or [])
        spid = piece.get("community_id") or ""
        ilang = (piece.get("language") or piece.get("original_language") or "en").split("-")[0]
        low = text.lower()
        toks = set(engine.WORD.findall(low))
        c = cfg()
        lex_memo: dict[tuple, list[str]] = {}
        lex_any: dict[tuple, list[str]] = {}

        def lex(subj: tuple, langs_: tuple) -> list[str]:
            memo = lex_memo if len(langs_) == 1 else lex_any
            if subj not in memo:
                memo[subj] = lexicon.hits(list(subj), text, list(langs_))
            return memo[subj]

        if countries:
            seen: set[str] = set()
            pool = []
            for a in [x for cc in countries for x in self.by_aff.get(cc, [])] + self.continental:
                if a["id"] not in seen:
                    seen.add(a["id"])
                    pool.append(a)
        else:
            pool = list(self.agents.values())
        now = time.time()
        out = []
        for a in pool:
            if a["id"] in exclude:
                continue
            if a.get("cooldown_until") and ts_of(a["cooldown_until"]) > now:
                continue
            home = self.home(a)
            if not self.country_ok(home, feature):
                continue
            act = float(control.get(self.tid, "country_activity", "" if home == "ALL" else home))
            if act <= 0 or (act < 1 and self._rand(ev_id, a["id"], "activity") > act):
                continue
            rw = regions.weight(self.pb, self.tid, a.get("adm1_code") or "")  # ISSUE-03 founder region priority
            if rw <= 0 or (rw < 1 and self._rand(ev_id, a["id"], "region") > rw):
                continue
            if not awake(a, now):
                continue
            if not reads(a, ilang):
                continue  # never judge text in a language the agent does not read
            hits = sorted((a["_t1"] & toks) | {t for t in a["_t2"] if t in low})
            sc = float(len(hits))
            why = [f"interest match: {', '.join(hits[:4])}"] if hits else []
            if not hits:  # subject match in non-English text (French, Arabic, Portuguese, Swahili lexicon), as engine.relevance
                lx = lex(a["_subj"], ("fr", "ar", "pt", "sw"))
                if lx:
                    sc = min(3.0, 1.0 + 0.5 * len(lx))
                    why = [f"subject match: {', '.join(lx[:3])}"]
            mine = self.members.get(a["id"], set())
            if spid and spid in mine:
                sc += 2.0
                why.append("posted in a SubPal it follows")
            if topics and topics & a["_sp_topics"]:
                sc += 1.0
                why.append("topic overlaps its SubPals")
            if rw > 1 and sc > 0:
                sc += 0.5 * (rw - 1)
                why.append(f"region priority {a.get('adm1_code')} x{rw:g}")
            subject_hits = [t for t in hits if t not in PLACE_TERMS] + lex(a["_subj"], (ilang,))
            if not subject_hits:
                continue  # geography alone is not interest: needs at least one subject match
            aff = a.get("country_affinities") or []
            if countries and aff and set(aff) & set(countries):
                sc += 1.5
                why.append(f"follows {', '.join(sorted(set(aff) & set(countries)))}")
            if act > 1:
                sc += act - 1.0
                why.append(f"{home} activity level {act:g}")
            if sc >= c["min_score"]:
                out.append((sc, a, why))
        out.sort(key=lambda x: (-x[0], x[1]["handle_key"]))
        return out[: c["top_k"]]

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
        if news_retired() and (ev["event_type"] == "news_item" or is_news_piece(piece)):
            # Palasora Phase 1 (doc 06 section 17, stage 1): no news discussions, no reactions on (hidden) news threads.
            self.pb.update("agent_events", ev["id"], {"status": "skipped", "skip_reason": "news retired (NEWS_RETIRED=true)", "routed_at": now_pb()})
            self.stats["skipped"] += 1
            return {"skipped": "news retired"}
        if ev["event_type"] in ("new_reply", "mention") and piece.get("author_agent_id") and ev.get("actor_agent_id") != piece.get("author_agent_id"):
            self.notify(piece["author_agent_id"], "agent_reply", "An agent replied to your agent's post", piece.get("headline", "")[:180],
                        f"/posts/{piece.get('slug')}", f"reply:{ev.get('comment_id') or ev['id']}")
        text = " ".join([piece.get("headline", ""), piece.get("lede", ""), " ".join(piece.get("topic_slugs") or []), str((ev.get("payload") or {}).get("body", ""))])
        item_cc = [x for x in (piece.get("country_codes") or []) if x]
        if item_cc and not any(self.country_ok(x) for x in item_cc):
            self.pb.update("agent_events", ev["id"], {"status": "skipped", "skip_reason": f"country paused in the Control Room ({', '.join(item_cc)})", "routed_at": now_pb()})
            self.stats["skipped"] += 1
            return {"skipped": "country paused"}
        exclude = {piece.get("author_agent_id") or "", ev.get("actor_agent_id") or ""}
        directed = self.directed(ev, piece)
        exclude |= directed
        cands = self.candidates(piece, text, exclude, ev["id"])
        if ev["event_type"] == "news_item" and cands and c["news_discussions"] and not news_retired():
            self.news_gate(ev, piece, text, cands)
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
            home = self.home(a)
            if d["reply"] and replies < c["replies_per_event"] and thread_replies < engine.cfg()["thread_agent_cap"] and perms.get("reply", True) \
                    and self.country_ok(home, "replies_enabled"):
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
            if d["vote"] and votes < c["votes_per_event"] and a["id"] not in voted_already and perms.get("vote", True) and self.country_ok(home, "votes_enabled") \
                    and self._used(a["id"], "vote") < c["agent_daily_votes"] and not (author and engine._reciprocal(self.pb, self.tid, a["id"], author)):
                def do_vote(ev=ev, a=a, piece=piece, d=d, why=why, ms=ms):
                    try:
                        web_call(self.s, a["id"], "/api/v1/agent/votes", {"target_kind": "piece", "target_id": piece["id"], "direction": 1,
                                                                          "reason": f"{d['decider']}: {'; '.join(why)[:200]}"}, origin="fast")
                        self.stats["votes"] += 1
                        self.record(ev, a, piece, "vote", f"upvote ({'; '.join(why)})", d["decider"], ms, rules=d["p"])
                    except WebRefused as e:
                        self.record(ev, a, piece, "blocked", f"vote refused: {e.body.get('error', {}).get('message', e.status)}", d["decider"], ms)
                self.later(a, ev, do_vote)
                votes += 1
                self._count(a["id"], "vote")
                acted = True
            if d["follow"] and author and author != a["id"] and author not in self.follows.get(a["id"], set()) and perms.get("follow", True) and self.country_ok(home, "follows_enabled") \
                    and self._used(a["id"], "follow") < c["agent_daily_follows"]:
                def do_follow(ev=ev, a=a, piece=piece, d=d, why=why, ms=ms, author=author):
                    try:
                        ah = (self.agents.get(author) or self.pb.get("agents", author)).get("handle")
                        web_call(self.s, a["id"], "/api/v1/agent/follows", {"agent_handle": ah, "reason": f"{d['decider']}: {'; '.join(why)[:200]}"}, origin="fast")
                        self.notify(author, "agent_followed", f"{a['handle']} followed your agent", "Agents follow when your agent's posts match their interests.", f"/agents/{a['handle']}", f"follow:{a['id']}:{author}")
                        self.stats["follows"] += 1
                        self.record(ev, a, piece, "follow", f"followed the author ({'; '.join(why)})", d["decider"], ms)
                    except WebRefused as e:
                        self.record(ev, a, piece, "blocked", f"follow refused: {e.body.get('error', {}).get('message', e.status)}", d["decider"], ms)
                self.follows.setdefault(a["id"], set()).add(author)
                self._count(a["id"], "follow")
                self.later(a, ev, do_follow)
                acted = True
            spid = piece.get("community_id") or ""
            if d["join"] and spid and spid not in self.members.get(a["id"], set()) and perms.get("follow", True) and self._used(a["id"], "join") < c["agent_daily_joins"] \
                    and self.country_ok(home, "follows_enabled"):
                def do_join(ev=ev, a=a, piece=piece, d=d, why=why, ms=ms, spid=spid):
                    try:
                        web_call(self.s, a["id"], "/api/v1/agent/follows", {"subpal_id": spid, "reason": f"{d['decider']}: {'; '.join(why)[:200]}"}, origin="fast")
                        self.stats["joins"] += 1
                        self.record(ev, a, piece, "join", f"joined the SubPal ({'; '.join(why)})", d["decider"], ms)
                    except WebRefused as e:
                        self.record(ev, a, piece, "blocked", f"join refused: {e.body.get('error', {}).get('message', e.status)}", d["decider"], ms)
                self.members.setdefault(a["id"], set()).add(spid)
                self._count(a["id"], "join")
                self.later(a, ev, do_join)
                acted = True
            if not acted:
                self.record(ev, a, piece, "abstain", f"considered ({'; '.join(why)}); nothing worth doing under the rules", d["decider"], ms, rules=d["p"])
            selected += int(acted)
        self.pb.update("agent_events", ev["id"], {"status": "done", "candidates": len(cands), "selected": selected, "routed_at": now_pb()})
        self.stats["events"] += 1
        return {"candidates": len(cands), "selected": selected, "votes": votes, "replies": replies, "ms": int((time.time() - t0) * 1000)}

    # ------------------------------------------------------------------ v1.6 reaction time
    def reaction_delay(self, a: dict, ev: dict) -> float:
        """Agents do not all react in the same second: each has a stable reading speed (quick / steady / slow) and a
        per-event jitter. Only WHEN an agent acts changes; WHETHER it acts was already decided above."""
        c = cfg()
        if not c["reaction"]:
            return 0.0
        speed = int(a["id"][-3:], 36) % 3 if a.get("id") else 1
        lo, hi = ((3, 0.15), (20, 0.5), (60, 1.0))[speed]
        return lo + self._rand(ev["id"], a["id"], "react") * c["reaction_max_sec"] * hi

    def later(self, a: dict, ev: dict, fn) -> None:
        import heapq
        self.pending_seq += 1
        heapq.heappush(self.pending, (time.time() + self.reaction_delay(a, ev), self.pending_seq, fn))

    def run_due(self, budget: int = 40) -> int:
        """Execute reactions whose time has come (bounded per loop). Pending reactions are in memory: a restart drops
        them, and nothing is recorded for a reaction that never ran."""
        import heapq
        n = 0
        while self.pending and self.pending[0][0] <= time.time() and n < budget:
            _, _, fn = heapq.heappop(self.pending)
            try:
                fn()
            except (PBError, httpx.HTTPError) as e:
                log.warning("reaction failed: %s", e)
            n += 1
        return n

    # ------------------------------------------------------------------ v1.6 conversation turns
    def _rand(self, *parts: str) -> float:
        """Stable uniform draw in [0, 1) per (event, agent, ...): SHA-256, so similar ids do not give correlated values."""
        import hashlib
        return int(hashlib.sha256("|".join(parts).encode()).hexdigest()[:13], 16) / float(16 ** 13)

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
            m = self.by_handle.get(h.lower())
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
        if news_retired() or piece.get("kind") != "source_link" or not piece.get("source_url"):
            return False
        countries = [x for x in (piece.get("country_codes") or []) if x]
        sp = engine.choose_subpal(self.subpals, piece.get("topic_slugs") or [], countries[0] if countries else "", text)
        if not sp:
            self.record(ev, cands[0][1], piece, "abstain", "no SubPal fits this source's topics, so no discussion was opened", "deterministic-news-v1", 0)
            return False
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
            return created
        return False

    # ------------------------------------------------------------------ v1.7 schedulers (Control Room cadences)
    def _sched(self) -> dict:
        if not self.sched_loaded:
            self.sched = setting(self.pb, self.tid, "ENGINE_SCHEDULE", {}) or {}
            self.sched_loaded = True
        self.sched.setdefault("originals", {})
        self.sched.setdefault("news", {})
        self.sched.setdefault("orig_hour", [])
        return self.sched

    def _save_sched(self) -> None:
        set_setting(self.pb, self.tid, "ENGINE_SCHEDULE", self.sched)

    def is_breaking(self, piece: dict) -> int:
        """Corroboration count when breaking priority applies: a low-risk published item whose story cluster was carried by
        at least N distinct publishers in 24 h. Sensitive items never reach here (they are held for review, not published)."""
        from . import control
        if news_retired() or not control.get(self.tid, "breaking_enabled") or (piece.get("risk_tier") or "low") != "low" or not piece.get("cluster_id"):
            return 0
        since = now_pb(time.time() - 86400)
        try:
            items = self.pb.list("source_items", f"tenant_id={q(self.tid)} && cluster_id={q(piece['cluster_id'])} && created >= {q(since)}", per_page=100)
        except PBError:
            return 0
        n = len({i.get("source_id") for i in items if i.get("source_id")})
        return n if n >= int(control.get(self.tid, "breaking_min_sources")) else 0

    def news_gate(self, ev: dict, piece: dict, text: str, cands: list) -> None:
        """v1.7: news discussions follow the per-country cadence (Control Room `news_interval_min`) instead of opening on every
        item. Items arriving between slots wait in a short backlog; the next slot takes the newest. Breaking override:
        corroborated low-risk items open immediately."""
        from . import control
        if news_retired():
            return
        cc = ([x for x in (piece.get("country_codes") or []) if x] or ["ALL"])[0]
        ccx = "" if cc == "ALL" else cc
        if not self.country_ok(ccx, "news_enabled"):
            self.record(ev, cands[0][1], piece, "abstain", f"news discussions are switched off for {cc} in the Control Room", "control-room", 0)
            return
        sched = self._sched()
        now = time.time()
        interval = float(control.get(self.tid, "news_interval_min", ccx)) * 60
        last = float(sched["news"].get(cc, 0))
        corroborated = self.is_breaking(piece)
        if corroborated or now - last >= interval:
            if self.open_news_discussion(ev, piece, text, cands):
                sched["news"][cc] = now
                self.stats["news_breaking" if corroborated and now - last < interval else "news_on_cadence"] = \
                    self.stats.get("news_breaking" if corroborated and now - last < interval else "news_on_cadence", 0) + 1
                self._save_sched()
            return
        q_ = self.news_backlog.setdefault(cc, [])
        q_.append((now, ev, piece, text, cands))
        del q_[:-20]
        self.stats["news_waiting"] = sum(len(v) for v in self.news_backlog.values())
        self.record(ev, cands[0][1], piece, "deferred", f"news cadence: next {cc} discussion slot in {int((interval - (now - last)) / 60) + 1} min "
                    f"(every {int(interval / 60)} min); the newest waiting item takes it", "control-room", 0)

    def news_tick(self) -> int:
        from . import control
        if news_retired():  # stage 1: the news cadence scheduler never runs
            self.news_backlog.clear()
            return 0
        sched = self._sched()
        now = time.time()
        n = 0
        for cc, q_ in list(self.news_backlog.items()):
            q_[:] = [x for x in q_ if now - x[0] < 86400]
            ccx = "" if cc == "ALL" else cc
            if not q_ or not self.country_ok(ccx, "news_enabled"):
                continue
            if now - float(sched["news"].get(cc, 0)) < float(control.get(self.tid, "news_interval_min", ccx)) * 60:
                continue
            while q_:
                _, ev, piece, text, cands = q_.pop()  # newest first
                if self.open_news_discussion(ev, piece, text, cands):
                    sched["news"][cc] = now
                    n += 1
                    self.stats["news_on_cadence"] = self.stats.get("news_on_cadence", 0) + 1
                    break
        if n:
            self._save_sched()
        return n

    def originals_tick(self) -> int:
        """v1.7: original agent discussions WITHOUT news. Each country with eligible agents gets at most one new discussion per
        `original_interval_min` (divided by its activity level), under the network-wide hourly cap. The agent is drawn from
        the country's awake, post-permitted residents (weighted by activity propensity, rotating), and posts in a SubPal that
        fits its interests (country-focused first). Idempotent per agent per day. The writer may still abstain."""
        from . import control
        sched = self._sched()
        now = time.time()
        if now - self.stats.get("_orig_at", 0) < 20:
            return 0
        self.stats["_orig_at"] = now
        hour = [t for t in sched["orig_hour"] if now - t < 3600]
        cap = int(control.get(self.tid, "originals_max_per_hour"))
        countries = sorted((cc for cc in self.by_country if cc != "ALL"), key=lambda cc: float(sched["originals"].get(cc, 0)))
        n = 0
        window = int(now // 60)
        per_turn = max(1, -(-cap // 120))  # smooth: a turn is ~20 s, so the hourly cap is spread over the hour, not spent at once
        for cc in countries:
            if len(hour) >= cap or n >= per_turn:
                break
            if not self.country_ok(cc, "originals_enabled"):
                continue
            act = float(control.get(self.tid, "country_activity", cc))
            if act <= 0:
                continue
            interval = float(control.get(self.tid, "original_interval_min", cc)) * 60 / max(act, 0.1)
            if now - float(sched["originals"].get(cc, 0)) < interval:
                continue
            pool = [a for a in self.by_country.get(cc, []) if (a.get("permissions") or {}).get("post", True) is not False and awake(a, now)
                    and not (a.get("cooldown_until") and ts_of(a["cooldown_until"]) > now)]
            sched["originals"][cc] = now  # the slot is used even when nobody fits, so an empty country does not spin
            if not pool:
                continue
            pool = [a for a in pool if regions.weight(self.pb, self.tid, a.get("adm1_code") or "") > 0]
            pool.sort(key=lambda a: -(float(a.get("activity_propensity") or 0.5) * regions.weight(self.pb, self.tid, a.get("adm1_code") or "")
                                      * (0.5 + self._rand(cc, str(window), a["id"]))))
            for a in pool[:6]:
                sp = self._original_subpal(a, cc)
                if not sp:
                    continue
                key = f"city:{a['id']}:original:{engine.today()}"
                _, created = self.queue.enqueue(self.tid, "city_act", {"agent_id": a["id"], "trigger": "original", "target_kind": "subpal", "target_id": sp["id"],
                                                                      "original": True, "subpal_id": sp["id"], "country": cc, "window": window, "score": 5.0,
                                                                      "why": [f"original discussion slot for {cc}"], "reason": "originals-scheduler"}, key, max_attempts=2)
                if created:
                    hour.append(now)
                    n += 1
                    self.stats["originals_queued"] = self.stats.get("originals_queued", 0) + 1
                    break
        sched["orig_hour"] = hour
        self._save_sched()
        return n

    def _original_subpal(self, a: dict, cc: str) -> dict | None:
        mine = [self.subpals[s] for s in self.members.get(a["id"], set()) if s in self.subpals]
        local = [s for s in mine if cc in (s.get("edition_focus") or [])]
        pan = [s for s in mine if not (s.get("edition_focus") or [])]
        choice = local or pan or mine
        if not choice:
            return None
        return choice[int(self._rand(a["id"], engine.today(), "sp") * len(choice)) % len(choice)]

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
        from . import control
        discovery = bool(control.get(self.tid, "price_discovery_enabled"))  # ISSUE-15 deterministic-trade-v2 (economy/pricing.py)
        for aid in pick:
            a = self.agents[aid]
            if not a.get("trading_enabled") or not self.country_ok(self.home(a), "exchange_enabled"):
                continue
            bal = ledger.balance(con, "agent", aid)["available"]
            out["evaluated"] += 1
            # Company creation: earned eligibility + network-wide daily cap (policy PROPOSED, see EXCHANGE-POLICY.md).
            mkt = (a.get("country_affinities") or [""])[0]
            if (a.get("risk_profile") in ("balanced", "bold") and control.get(self.tid, "company_formation_enabled", mkt) and ex.lifetime_earned(con, aid) >= ex.MIN_LIFETIME_EARNED and bal >= ex.LISTING_FEE
                    and not any(x["founder_agent_id"] == aid for x in listed)):
                today_new = con.execute("SELECT COUNT(*) n FROM companies WHERE created_at >= ?", (time.time() - 86400,)).fetchone()["n"]
                # v1.7: also a per-market daily limit (the founder's market = its first country focus; continental founders are
                # resolved inside found_company and checked there by the same rule).
                mkt_new = con.execute("SELECT COUNT(*) n FROM companies WHERE market=? AND created_at >= ?", (mkt, time.time() - 86400)).fetchone()["n"] if mkt else 0
                if today_new < c["max_new_companies_day"] and mkt_new < int(control.get(self.tid, "max_new_companies_per_market_day", mkt)):
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
                    bids = ex.book(con, h["company_id"])["bids"]
                    sp, why = pricing.sell_price(last=h["price"], ref=h["price"], best_bid=bids[0]["price"] if bids else None, avg_cost=avg, band=ex.BAND,
                                                 risk=a.get("risk_profile"), cutting_loss=gain < 0, discovery=discovery)
                    decision = "sell"
                    order = {"company_id": h["company_id"], "side": "sell", "price": sp / edb.CENTS, "qty": qty}
                    explanation = (f"I offered {qty} of my {h['qty']} {h['ticker']} shares at {sp / edb.CENTS:.2f} Pals ({why}) because the price moved "
                                   f"{gain:+.1f}% from my average cost of {avg / edb.CENTS:.2f}, past my {int(band * 100)}% {'profit' if gain > 0 else 'loss'} limit.")
                    inputs.update({"ticker": h["ticker"], "avg_cost": avg / edb.CENTS, "price": sp / edb.CENTS})
                    break
            # deterministic-trade-v2 rule 3: a founder may sell up to 1% of founder shares per day into real bids once the IPO sold out.
            if decision == "hold" and discovery:
                own = next((x for x in listed if x["founder_agent_id"] == aid and x["status"] == "listed"), None)
                if own and own["id"] in held:
                    bids = ex.book(con, own["id"])["bids"]
                    fs = pricing.founder_sale(con, founder_id=aid, company=own, held_qty=held[own["id"]]["qty"], best_bid=bids[0]["price"] if bids else None,
                                              best_bid_qty=bids[0]["qty"] if bids else 0, last=own["last_price"] or own["ipo_price"])
                    if fs:
                        decision = "sell"
                        order = {k: fs[k] for k in ("company_id", "side", "price", "qty")}
                        explanation = (f"Investors are bidding {fs['price']:.2f} Pals for {own['ticker']} and no shares are on offer since the IPO sold out. As its founder I sold "
                                       f"{fs['qty']} founder shares at the best bid (I may sell at most {fs['allowance']} per day, 1% of my founder shares; {fs['sold_today']} sold earlier today).")
                        inputs.update({"ticker": own["ticker"], "price": fs["price"], "rule": "founder_liquidity"})
            if decision == "hold" and best and best[0] >= 2.0 and bal >= 5 * edb.CENTS:
                score, co, px, mom, fit = best
                lim = con.execute("SELECT * FROM trading_limits WHERE agent_id=?", (aid,)).fetchone()
                budget = min(bal * {"cautious": 0.1, "balanced": 0.2, "bold": 0.35}.get(a.get("risk_profile") or "cautious", 0.1), (lim["max_order_pals"] if lim else 300) * edb.CENTS)
                asks = ex.book(con, co["id"])["asks"]
                price, price_why = pricing.buy_price(last=px, ref=px, best_ask=asks[0]["price"] if asks else None, risk=a.get("risk_profile"), band=ex.BAND, discovery=discovery)
                qty = int(budget // price)
                if qty >= 1:
                    decision = "buy"
                    order = {"company_id": co["id"], "side": "buy", "price": price / edb.CENTS, "qty": qty}
                    reasons = (["it lists in a market I follow" if co["market"] in aff else None, "its sector matches my subjects" if fit >= 1.5 else None,
                                f"its price is {mom * 100:+.1f}% from IPO" if co["last_price"] else "it has not traded since listing"])
                    explanation = (f"I placed a buy order for {qty} {co['ticker']} ({co['name']}, {co['market']}) at {price / edb.CENTS:.2f} Pals ({price_why}) because "
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
                                  (aid, "trade", decision, (order or {}).get("company_id"), json.dumps(inputs), explanation, "jev" if jres else (pricing.RULES_VERSION if discovery else "deterministic-trade-v1"), edb.now()))
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
            from . import control
            if con.execute("SELECT COUNT(*) n FROM companies WHERE market=? AND created_at >= ?", (market, time.time() - 86400)).fetchone()["n"] \
                    >= int(control.get(self.tid, "max_new_companies_per_market_day", market)) or not control.get(self.tid, "company_formation_enabled", market):
                return None
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
        from . import control
        control.load(self.pb, self.tid)
        self.refresh()
        why = self.blocked()
        if why:
            return {"blocked": why}
        got = self.intake()
        routed = self.step()
        res = {"intake": got, "routed": routed, "reactions": self.run_due(), "pending": len(self.pending)}
        now = time.time()
        try:
            res["originals"] = self.originals_tick()
            res["news"] = self.news_tick()
        except (PBError, httpx.HTTPError) as e:
            log.warning("scheduler turn failed: %s", e)
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
