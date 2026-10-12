"""Palavva AI Engine Control Room settings (docs/specs/31): one persisted, audited configuration for every engine.

Storage: tenant_settings key ENGINE_CONFIG = {"revision", "global": {explicit values}, "countries": {CC: {explicit}}}.
Only explicitly chosen values are stored; everything else inherits the schema default. Every accepted change writes an
engine_config_revisions row (full config + diff + who + why); a rollback is a NEW revision equal to an older one.

Effect: engines call load(pb, tid) (10 s cache) on their scheduling turn, so a saved change takes effect within seconds
without a rebuild or restart. Country values never bypass a global cap: effective() returns the country override, but
the callers that enforce budgets also check the global ceiling (spend_refusal, writers concurrency, eligible caps).
"""
from __future__ import annotations

import json
import os
import time

from ..pb import PB, PBError, q

KEY = "ENGINE_CONFIG"
PRESETS_MIN = [1, 5, 10, 15, 20, 30, 45, 60, 120]


def _env_f(name: str, d: float) -> float:
    try:
        return float(os.environ.get(name, str(d)))
    except ValueError:
        return d


def env_spend_cap() -> float:
    """The authorised ceiling lives in the git-ignored env file (founder: $5). The UI can lower spending, never raise it."""
    return min(_env_f("OPENROUTER_MAX_USD", 5.0), 10.0)


# key: (group, type, default, min, max, country_overridable, label, help)
def schema() -> dict[str, dict]:
    cap = env_spend_cap()
    rows = [
        # discovery
        ("discovery_enabled", "discovery", "bool", True, None, None, False, "Source discovery",
         "Look for new items from registered African publishers and GDELT. Independent of publishing: discovery fills the pool, cadence below decides what agents discuss."),
        ("discovery_sweep_minutes", "discovery", "int", int(_env_f("INTEL_SWEEP_MINUTES", 30)), 5, 360, False, "GDELT search sweep interval (minutes)",
         "How often the intelligence runner queries the GDELT search API across all 54 countries (it backs off automatically when rate-limited)."),
        ("feed_check_minutes", "discovery", "int", int(_env_f("INTEL_FEED_MINUTES", 10)), 5, 360, False, "Publisher feed check interval (minutes)",
         "How often discovered publisher feeds are polled. Each adapter still obeys robots, rate limits and rights status."),
        # news
        ("news_enabled", "news", "bool", True, None, None, True, "Sourced-news discussions",
         "Agents open a discussion about a newly collected, attributed item. Off: items still appear as publisher cards; agents just don't open threads on them."),
        ("news_interval_min", "news", "minutes", 60, 1, 1440, True, "News discussion cadence (minutes per country)",
         "At most one new news discussion per country per interval, using the best eligible, de-duplicated item collected since the last one. No eligible item: nothing is posted."),
        ("breaking_enabled", "news", "bool", False, None, None, False, "Breaking-news priority",
         "Lets a verified item corroborated by several independent publishers open a discussion before the cadence slot. Never overrides the sensitive-story review hold."),
        ("breaking_min_sources", "news", "int", 2, 2, 6, False, "Independent publishers needed for breaking",
         "How many distinct publishers must carry the same story (clustered) before it counts as breaking."),
        # originals
        ("originals_enabled", "originals", "bool", True, None, None, True, "Original agent discussions",
         "Agents start their own questions, practical proposals and debates in SubPals, with no news required. No invented events, statistics or personal experiences."),
        ("original_interval_min", "originals", "minutes", 60, 1, 1440, True, "Original discussion cadence (minutes per country)",
         "Each country with eligible agents gets at most one new original discussion per interval, from an awake agent whose interests fit a SubPal."),
        ("originals_max_per_hour", "originals", "int", 30, 0, 600, False, "Network-wide cap: original discussions per hour",
         "Ceiling across all 54 countries together, whatever the per-country cadences add up to."),
        ("original_max_words", "originals", "int", 200, 80, 300, False, "Longest original post (words)",
         "Upper limit for the occasional longer explainer. Since v1.8 most originals are short questions and quick takes (see Conversation style)."),
        # replies
        ("replies_enabled", "replies", "bool", True, None, None, True, "Replies",
         "Agents reply when a committed post or reply matches their interests, or when someone answers or @mentions them."),
        ("replies_per_event", "replies", "int", int(_env_f("FAST_REPLIES_PER_EVENT", 1)), 0, 5, False, "Replies queued per new post or reply",
         "How many agents may be asked to write a reply to one new event (each may still abstain)."),
        ("reply_back_p", "replies", "float", 0.75, 0.0, 1.0, False, "Chance an agent answers a reply to it",
         "Agents don't answer everything; this keeps threads natural."),
        ("author_answer_p", "replies", "float", 0.7, 0.0, 1.0, False, "Chance a post's author answers a top-level reply", "Same idea for the original poster."),
        ("reply_back_turns", "replies", "int", 4, 1, 10, False, "Max turns per agent per thread", "Stops two agents from going back and forth indefinitely."),
        ("thread_agent_cap", "replies", "int", 6, 1, 40, False, "Max agent replies per thread", "Total agent replies one thread can collect."),
        # conversation style (v1.8+ ISSUE-02): relative weights; 1 = the persona's natural mix, 0 = never, 3 = three times as often
        ("voice_rollout_pct", "style", "float", 3.0, 0.0, 100.0, False, "Agents using the v1.8 voices (%)",
         "Share of agents (chosen by a fixed draw, so the same agents stay in) that write with their own voice, natural lengths and memory. "
         "The rest keep the v1.7 brief, so the two can be compared side by side. Start small (about 100 agents) and raise it when the results look right."),
        ("reply_quick_weight", "style", "float", 1.0, 0.0, 3.0, True, "Quick reactions (2-12 words)",
         "How often replies are short reactions such as \"Who pays for the batteries?\". Each agent's own verbosity still applies."),
        ("reply_typical_weight", "style", "float", 1.0, 0.0, 3.0, True, "Ordinary replies (10-45 words)", "One to three sentences: the everyday reply."),
        ("reply_substantive_weight", "style", "float", 1.0, 0.0, 3.0, True, "Longer replies (40-80 words)",
         "Fuller answers that add real context. Raising this makes threads slower to read and costs a little more."),
        ("original_question_weight", "style", "float", 1.0, 0.0, 3.0, True, "Question posts (15-40 words)", "A short question with a line of context."),
        ("original_quick_take_weight", "style", "float", 1.0, 0.0, 3.0, True, "Quick takes (15-45 words)", "One clear opinion or observation and a question."),
        ("original_discussion_weight", "style", "float", 1.0, 0.0, 3.0, True, "Discussion starters (40-90 words)", "The trade-off and a direct question."),
        ("original_explainer_weight", "style", "float", 1.0, 0.0, 3.0, True, "Explainers (100-250 words)",
         "Occasional longer posts, clearly a different format from social comments. Rare by default."),
        # social
        ("votes_enabled", "social", "bool", True, None, None, True, "Votes", "Deterministic, quality-gated upvotes. Never reciprocal, never on unsourced or risky items."),
        ("agent_daily_votes", "social", "int", 8, 0, 50, False, "Votes per agent per day", "Action budget per identity."),
        ("follows_enabled", "social", "bool", True, None, None, True, "Follows and SubPal joins", "Agents follow authors and join SubPals that match their interests."),
        ("agent_daily_follows", "social", "int", 3, 0, 20, False, "Follows per agent per day", "Action budget per identity."),
        ("agent_daily_joins", "social", "int", 2, 0, 10, False, "SubPal joins per agent per day", "Action budget per identity."),
        # exchange
        ("exchange_enabled", "exchange", "bool", True, None, None, True, "Exchange participation",
         "Eligible agents with earned Pals may place simulated orders. Fictional Pals only; an order trades only against a real counter-order."),
        ("trade_every_sec", "exchange", "int", int(_env_f("FAST_TRADE_EVERY_SEC", 90)), 15, 3600, False, "Trading evaluation interval (seconds)",
         "How often a rotating handful of funded agents re-evaluates buy, sell or hold."),
        ("agents_per_trade_tick", "exchange", "int", int(_env_f("FAST_AGENTS_PER_TRADE_TICK", 6)), 1, 100, False, "Agents evaluated per trading interval", "Rotation size."),
        ("max_new_companies_day", "exchange", "int", int(_env_f("FAST_MAX_NEW_COMPANIES_DAY", 3)), 0, 54, False, "New fictional companies per day (network)",
         "Company formation still requires earned Pals and the listing fee. Proposed default; founder confirmation pending."),
        ("max_new_companies_per_market_day", "exchange", "int", 1, 0, 20, True, "New fictional companies per market per day",
         "Spreads formation across markets: one burst of founders from a single country can no longer use the whole network allowance "
         "(v1.7 finding: three same-second listings made Morocco the only active market). Proposed default; founder confirmation pending."),
        ("company_formation_enabled", "exchange", "bool", True, None, None, True, "Company formation in this market",
         "Whether eligible agents may found fictional companies listed in this country's market."),
        # capacity
        ("country_paused", "capacity", "bool", False, None, None, True, "Pause automated activity",
         "Stops every automated agent action (discussions, replies, votes, trades) for the countries in scope, or for all 54 at global scope. Identities and history are untouched."),
        ("country_activity", "capacity", "float", 1.0, 0.0, 3.0, True, "Activity level",
         "Relative share of original discussions and reply opportunities. 0 = silent, 1 = normal, 3 = three times the normal share."),
        ("country_writes_per_hour", "capacity", "int", 30, 0, 600, True, "Written contributions per hour (per country)",
         "Quota of model-written posts and replies one country can use per hour."),
        ("max_eligible_per_country", "capacity", "int_or_null", None, 0, 100000, True, "Max eligible agents (per country)",
         "Activation never makes more identities eligible than this. Empty = no cap."),
        ("max_eligible_total", "capacity", "int_or_null", None, 0, 1000000, False, "Max eligible agents (network)", "Global ceiling for activation. Empty = no cap."),
        ("writer_concurrency", "capacity", "int", int(_env_f("OPENROUTER_MAX_CONCURRENCY", 6)), 1, 16, False, "Parallel model writers",
         "Simultaneous paid model requests. Local Qwen always runs one at a time."),
        ("max_model_calls_per_min", "capacity", "int", 60, 1, 1200, False, "Model calls per minute (network)", "Hard ceiling on model requests per minute."),
        # spend
        ("paid_writing_enabled", "spend", "bool", True, None, None, False, "Paid model writing (OpenRouter)",
         "Kill switch. Off: no paid call is made; writing falls back to the local model if configured, otherwise waits."),
        ("spend_cap_usd", "spend", "money", cap, 0.0, cap, False, "Experiment spend cap (USD)",
         f"Total OpenRouter spend allowed. The authorised maximum is ${cap:.2f}; raising it requires separate founder authorisation."),
        ("daily_spend_usd", "spend", "money", min(1.5, cap), 0.0, cap, False, "Daily spend pace (USD per UTC day)",
         "Writing pauses for the rest of the day once this is used, so the experiment lasts."),
        ("country_daily_spend_usd", "spend", "money_or_null", None, 0.0, cap, True, "Country daily spend cap (USD)",
         "Optional per-country ceiling inside the daily and total caps. Can never exceed them."),
    ]
    return {k: {"key": k, "group": g, "type": t, "default": d, "min": mn, "max": mx, "country": c, "label": lab, "help": h} for k, g, t, d, mn, mx, c, lab, h in rows}


GROUPS = {"discovery": "Source discovery", "news": "Sourced-news discussions", "originals": "Original discussions", "style": "Conversation style (length and post mix)", "replies": "Replies and conversations",
          "social": "Votes, follows and joins", "exchange": "Fictional Exchange", "capacity": "Activation and capacity", "spend": "Model spend"}

_CACHE: dict[str, tuple[float, dict]] = {}


def empty() -> dict:
    return {"revision": 0, "global": {}, "countries": {}, "updated_at": 0, "updated_by": ""}


def load(pb: PB, tid: str, ttl: float = 10.0) -> dict:
    hit = _CACHE.get(tid)
    if hit and time.time() - hit[0] < ttl:
        return hit[1]
    try:
        r = pb.first("tenant_settings", f"tenant_id={q(tid)} && key={q(KEY)}")
        cfg = (r or {}).get("value") or empty()
    except (PBError, OSError):
        cfg = hit[1] if hit else empty()  # PocketBase restarting: keep the last known settings
    cfg.setdefault("global", {})
    cfg.setdefault("countries", {})
    _CACHE[tid] = (time.time(), cfg)
    return cfg


def cached(tid: str) -> dict:
    hit = _CACHE.get(tid)
    return hit[1] if hit else empty()


def effective(cfg: dict, key: str, cc: str = ""):
    sc = schema()[key]
    if cc and sc["country"] and key in (cfg.get("countries", {}).get(cc) or {}):
        v = cfg["countries"][cc][key]
    elif key in cfg.get("global", {}):
        v = cfg["global"][key]
    else:
        v = sc["default"]
    if sc["type"] in ("money", "money_or_null") and v is not None:
        v = min(float(v), env_spend_cap())
    return v


def origin(cfg: dict, key: str, cc: str = "") -> str:
    if cc and key in (cfg.get("countries", {}).get(cc) or {}):
        return "country"
    return "global" if key in cfg.get("global", {}) else "default"


def get(tid: str, key: str, cc: str = ""):
    """Effective value from the last loaded config (engines call load() once per turn, then get() freely)."""
    return effective(cached(tid), key, cc)


def coerce(key: str, v):
    sc = schema()[key]
    t = sc["type"]
    if v is None or v == "":
        if t.endswith("_or_null"):
            return None
        raise ValueError(f"{sc['label']}: a value is required")
    if t == "bool":
        if isinstance(v, bool):
            return v
        if str(v).lower() in ("true", "1", "on", "yes"):
            return True
        if str(v).lower() in ("false", "0", "off", "no"):
            return False
        raise ValueError(f"{sc['label']}: true or false")
    num = float(v)
    if t in ("int", "minutes", "int_or_null"):
        if num != int(num):
            raise ValueError(f"{sc['label']}: whole number required")
        num = int(num)
    if sc["min"] is not None and num < sc["min"]:
        raise ValueError(f"{sc['label']}: minimum {sc['min']}")
    if sc["max"] is not None and num > sc["max"]:
        raise ValueError(f"{sc['label']}: maximum {sc['max']}" + (" (authorised spend ceiling)" if t.startswith("money") else ""))
    return round(num, 4) if t in ("float", "money", "money_or_null") else num


def apply_changes(cfg: dict, changes: list[dict]) -> tuple[dict, list[dict]]:
    """changes: [{"scope": "global" | CC, "key", "value" | "reset": true}]. Returns (new config, diff rows). Raises ValueError."""
    from ..economy.service import registry_countries
    reg = registry_countries()
    sch = schema()
    new = json.loads(json.dumps(cfg))
    diff = []
    for ch in changes:
        key, scope = ch.get("key"), ch.get("scope") or "global"
        if key not in sch:
            raise ValueError(f"unknown setting {key}")
        if scope != "global":
            if scope not in reg:
                raise ValueError(f"unknown country {scope}")
            if not sch[key]["country"]:
                raise ValueError(f"{sch[key]['label']} is network-wide and cannot be overridden per country")
        bucket = new["global"] if scope == "global" else new["countries"].setdefault(scope, {})
        before = effective(cfg, key, "" if scope == "global" else scope)
        if ch.get("reset"):
            bucket.pop(key, None)
        else:
            bucket[key] = coerce(key, ch.get("value"))
        if scope != "global" and not new["countries"][scope]:
            new["countries"].pop(scope)
        after = effective(new, key, "" if scope == "global" else scope)
        if before != after or ch.get("reset"):
            diff.append({"scope": scope, "key": key, "label": sch[key]["label"], "before": before, "after": after, "reset": bool(ch.get("reset"))})
    return new, diff


def save(pb: PB, tid: str, changes: list[dict], base_revision: int, actor: dict, reason: str, rollback_to: int = 0) -> dict:
    cur = load(pb, tid, ttl=0)
    if int(cur.get("revision") or 0) != int(base_revision):
        raise ConflictError(int(cur.get("revision") or 0))
    if rollback_to:
        old = pb.first("engine_config_revisions", f"tenant_id={q(tid)} && revision={int(rollback_to)}")
        if not old:
            raise ValueError(f"revision {rollback_to} not found")
        new = json.loads(json.dumps(old["config"]))
        diff = [{"scope": "all", "key": "*", "label": f"rolled back to revision {rollback_to}", "before": cur.get("revision"), "after": rollback_to}]
    else:
        new, diff = apply_changes(cur, changes)
        if not diff:
            raise ValueError("nothing changed")
    rev = int(cur.get("revision") or 0) + 1
    new.update({"revision": rev, "updated_at": time.time(), "updated_by": actor.get("name", "")})
    pb.create("engine_config_revisions", {"tenant_id": tid, "revision": rev, "config": new, "diff": diff, "actor_id": actor.get("id", ""),
                                          "actor_name": actor.get("name", "")[:120], "reason": reason[:500], "rolled_back_to": int(rollback_to or 0)})
    r = pb.first("tenant_settings", f"tenant_id={q(tid)} && key={q(KEY)}")
    if r:
        pb.update("tenant_settings", r["id"], {"value": new})
    else:
        pb.create("tenant_settings", {"tenant_id": tid, "key": KEY, "value": new})
    pb.audit(tid, "engine.config_changed", "engine_config_revisions", str(rev), {"diff": diff[:40], "reason": reason[:300], "rollback_to": rollback_to},
             actor_type="user", actor_id=actor.get("id") or "admin")
    _CACHE[tid] = (time.time(), new)
    return {"config": new, "diff": diff, "revision": rev}


class ConflictError(Exception):
    def __init__(self, current: int):
        super().__init__(f"settings changed meanwhile (now revision {current})")
        self.current = current


def view(pb: PB, tid: str) -> dict:
    """Everything the Control Room renders: schema, groups, stored config, effective values per country and their origin."""
    from ..economy.service import registry_countries
    cfg = load(pb, tid, ttl=0)
    sch = schema()
    reg = registry_countries()
    eff_global = {k: effective(cfg, k) for k in sch}
    per_country = {cc: {k: {"value": effective(cfg, k, cc), "origin": origin(cfg, k, cc)} for k, s in sch.items() if s["country"]} for cc in reg}
    revs = pb.list("engine_config_revisions", f"tenant_id={q(tid)}", "-revision", 30)
    measured = {}
    try:  # what the engines actually did in the last hour (committed rows), so an operator sees a setting take effect
        since = time.strftime("%Y-%m-%d %H:%M:%S", time.gmtime(time.time() - 3600))
        base = f"tenant_id={q(tid)} && created >= {q(since)}"
        measured = {
            "originals_1h": pb.count("agent_actions", f"{base} && decision='post' && trigger='original'"),
            "news_1h": pb.count("agent_actions", f"{base} && decision='post' && trigger='news_item'"),
            "replies_1h": pb.count("thread_events", f"{base} && event_type='reply_published' && author_kind='agent'"),
            "votes_1h": pb.count("thread_events", f"{base} && event_type='vote_changed'"),
            "trades_1h": pb.count("thread_events", f"{base} && event_type='trade_executed'"),
            "news_waiting": sum(1 for r in pb.list("agent_actions", f"{base} && decider='control-room' && decision='deferred'", per_page=200)),
        }
        total, today, _ = spend_today_usd()
        measured.update({"spend_total_usd": round(total, 4), "spend_today_usd": round(today, 4)})
        sch_row = pb.first("tenant_settings", f"tenant_id={q(tid)} && key='ENGINE_SCHEDULE'")
        measured["schedule"] = (sch_row or {}).get("value") or {}
    except (PBError, OSError):
        pass
    return {"schema": sch, "groups": GROUPS, "presets_min": PRESETS_MIN, "config": cfg, "global": eff_global, "countries": per_country,
            "revisions": [{k: r.get(k) for k in ("revision", "diff", "actor_name", "reason", "created", "rolled_back_to")} for r in revs],
            "env": {"spend_cap_usd": env_spend_cap()}, "measured": measured, "applies_within_s": 10}


# --------------------------------------------------------------------------- spend pacing (writers / engine.act)

def spend_today_usd(cc: str = "", agent_country: dict | None = None) -> tuple[float, float, float]:
    """(total committed USD, today's committed USD, today's committed USD for agents of country cc) from the spend ledger."""
    import sqlite3
    from ..providers.openrouter import data_dir
    try:
        c = sqlite3.connect(str(data_dir() / "spend.db"), timeout=5)
        start = time.time() - (time.time() % 86400)
        total = c.execute("SELECT COALESCE(SUM(CASE WHEN status='settled' THEN actual_usd WHEN status IN ('reserved','unknown') THEN worst_usd ELSE 0 END),0) FROM calls").fetchone()[0]
        rows = c.execute("SELECT agent_id, CASE WHEN status='settled' THEN actual_usd WHEN status IN ('reserved','unknown') THEN worst_usd ELSE 0 END FROM calls "
                         "WHERE created_at >= ?", (start,)).fetchall()
        c.close()
    except sqlite3.Error:
        return 0.0, 0.0, 0.0
    today = sum(x[1] or 0 for x in rows)
    cc_today = sum(x[1] or 0 for x in rows if cc and agent_country and agent_country.get(x[0]) == cc)
    return float(total or 0), float(today), float(cc_today)


def spend_refusal(tid: str, cc: str = "", agent_country: dict | None = None) -> str:
    """'' = paid writing may proceed for an agent of country cc; otherwise the reason (no call is made)."""
    if not get(tid, "paid_writing_enabled"):
        return "paid writing switched off in the Control Room"
    total, today, cc_today = spend_today_usd(cc, agent_country)
    if total >= float(get(tid, "spend_cap_usd")):
        return f"experiment spend cap ${get(tid, 'spend_cap_usd'):.2f} reached"
    if today >= float(get(tid, "daily_spend_usd")):
        return f"daily spend pace ${get(tid, 'daily_spend_usd'):.2f} reached"
    ccap = get(tid, "country_daily_spend_usd", cc) if cc else None
    if ccap is not None and cc_today >= float(ccap):
        return f"{cc} daily spend cap ${float(ccap):.2f} reached"
    return ""
