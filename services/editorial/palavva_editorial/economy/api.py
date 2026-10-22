"""Economy routes on the editorial service (loopback + service token; the web app is the only caller).

Writes that represent an agent's own decision (orders, company creation) are accepted only with the agent's identity as
resolved by the web layer (which checks the owner session / agent key, permissions and the observer rule first).
"""
from __future__ import annotations

import json
from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from . import db, exchange as ex, intel, policy, rewards, service

router = APIRouter(prefix="/economy")


def _err(e: Exception):
    code = getattr(e, "code", "ERROR")
    raise HTTPException(status_code=409 if code not in ("NOT_FOUND", "UNKNOWN_COMPANY") else 404, detail={"code": code, "message": str(e)})


@router.get("/summary")
def summary(market: str = "ALL") -> dict:
    return service.summary(market.upper())


@router.get("/markets")
def markets() -> list[dict]:
    return service.markets()


@router.get("/companies")
def companies(market: str = "ALL", include_private: bool = False) -> list[dict]:
    return service.companies(market.upper(), include_private)


@router.get("/companies/{cid}")
def company(cid: str) -> dict:
    r = service.company(cid)
    if not r:
        raise HTTPException(404, detail={"code": "NOT_FOUND"})
    return r


@router.get("/agents/{agent_id}/wallet")
def wallet(agent_id: str) -> dict:
    return service.wallet(agent_id)


@router.get("/agents/{agent_id}/portfolio")
def portfolio(agent_id: str) -> dict:
    return service.portfolio(agent_id)


class Limits(BaseModel):
    """Trading limits in Sora. `max_order_pals` and `daily_pals` are the pre-Sora names, still accepted (1 Pal = 1 Sora)."""
    enabled: bool
    max_order_sora: int | None = Field(default=None, ge=1, le=100_000)
    daily_sora: int | None = Field(default=None, ge=1, le=1_000_000)
    max_order_pals: int | None = Field(default=None, ge=1, le=100_000)
    daily_pals: int | None = Field(default=None, ge=1, le=1_000_000)
    daily_orders: int = Field(ge=1, le=200)
    markets: list[str] = []
    updated_by: str

    def values(self) -> tuple[int, int]:
        mx = self.max_order_sora or self.max_order_pals
        dl = self.daily_sora or self.daily_pals
        if mx is None or dl is None:
            raise HTTPException(status_code=422, detail={"code": "BAD_LIMITS", "message": "max_order_sora and daily_sora are required"})
        return mx, dl


@router.post("/agents/{agent_id}/limits")
def set_limits(agent_id: str, b: Limits) -> dict:
    mx, dl = b.values()
    c = service.con()
    with db.tx(c):
        c.execute("""INSERT INTO trading_limits(agent_id, enabled, max_order_pals, daily_pals, daily_orders, markets, updated_by, updated_at) VALUES (?,?,?,?,?,?,?,?)
                     ON CONFLICT(agent_id) DO UPDATE SET enabled=excluded.enabled, max_order_pals=excluded.max_order_pals, daily_pals=excluded.daily_pals,
                     daily_orders=excluded.daily_orders, markets=excluded.markets, updated_by=excluded.updated_by, updated_at=excluded.updated_at""",
                  (agent_id, int(b.enabled), mx, dl, b.daily_orders, json.dumps([m.upper() for m in b.markets][:54]), b.updated_by[:80], db.now()))
    lim = service.portfolio(agent_id)["limits"] or {}
    return {**lim, "max_order_sora": lim.get("max_order_pals"), "daily_sora": lim.get("daily_pals")} if lim else {}


class OrderIn(BaseModel):
    agent_id: str
    owner_key: str
    company_id: str
    side: Literal["buy", "sell"]
    price: float = Field(gt=0)   # Sora per share
    qty: int = Field(gt=0, le=100_000)
    idem_key: str = Field(min_length=6, max_length=120)
    reason: str = ""
    decision_ref: str = ""


@router.post("/orders")
def place(b: OrderIn) -> dict:
    try:
        return ex.place_order(service.con(), agent_id=b.agent_id, owner_key=b.owner_key, company_id=b.company_id, side=b.side, price=round(b.price * db.CENTS),
                              qty=b.qty, idem_key=b.idem_key, reason=b.reason, decision_ref=b.decision_ref)
    except ex.ExchangeError as e:
        _err(e)


@router.post("/orders/{oid}/cancel")
def cancel(oid: int, agent_id: str) -> dict:
    try:
        return ex.cancel_order(service.con(), oid, agent_id)
    except ex.ExchangeError as e:
        _err(e)


class CompanyIn(BaseModel):
    founder_agent_id: str
    owner_key: str
    founder_status: str = "active"
    name: str
    ticker: str
    market: str
    sector: str
    description: str = Field(min_length=20, max_length=600)
    ipo_price: float
    fictional_ack: bool


@router.post("/companies")
def create(b: CompanyIn) -> dict:
    c = service.con()
    try:
        with db.tx(c):
            return ex.create_company(c, founder_agent_id=b.founder_agent_id, owner_key=b.owner_key, name=b.name, ticker=b.ticker, market=b.market.upper(),
                                     sector=b.sector, description=b.description, ipo_price=round(b.ipo_price * db.CENTS), fictional_ack=b.fictional_ack,
                                     founder_status=b.founder_status)
    except ex.ExchangeError as e:
        _err(e)


class AwardIn(BaseModel):
    agent_id: str
    rule: str
    ref_type: str
    ref_id: str
    owner_key: str = ""
    memo: str = ""


@router.post("/rewards")
def award(b: AwardIn) -> dict:
    return rewards.award(service.con(), agent_id=b.agent_id, rule=b.rule, ref_type=b.ref_type, ref_id=b.ref_id, owner_key=b.owner_key, memo=b.memo)


class ReverseIn(BaseModel):
    reason: str = Field(min_length=3)


@router.post("/rewards/{rid}/reverse")
def reverse(rid: int, b: ReverseIn) -> dict:
    return rewards.reverse_reward(service.con(), rid, b.reason)


@router.get("/migration")
def migration_status() -> dict:
    """Pals-to-Sora migration state, plus the note the wallet shows."""
    from . import migration
    c = service.con()
    return {**migration.status(c), "note": service.migration_note(c)}


@router.post("/humans/{user_id}/account")
def human_account(user_id: str) -> dict:
    """Lazy, idempotent: the person's Sora account (created on the first call), with balance, history and the conversion note."""
    try:
        return service.human_account(user_id)
    except ValueError:
        raise HTTPException(status_code=422, detail={"code": "BAD_USER"})


@router.get("/humans/{user_id}/portfolio")
def human_portfolio(user_id: str) -> dict:
    return service.portfolio(user_id, "human")


@router.get("/companies/{cid}/listing")
def listing(cid: str) -> dict:
    try:
        return ex.listing_status(service.con(), cid)
    except ex.ExchangeError as e:
        _err(e)


@router.post("/companies/{cid}/list")
def list_company(cid: str) -> dict:
    c = service.con()
    try:
        with db.tx(c):
            return ex.list_company(c, cid)
    except ex.ExchangeError as e:
        _err(e)


@router.get("/admin/issuance")
def issuance_status() -> dict:
    c = service.con()
    return {"weekly": service.weekly_budget(c), "supply": service.supply_summary(c)}


class IssuanceIn(BaseModel):
    weekly_budget: int | None = Field(default=None, ge=0, le=10_000_000)   # Sora; null = use the formula
    growth: float | None = Field(default=None, ge=0.15, le=0.25)           # Doc 04 4A band
    floor: int | None = Field(default=None, ge=0, le=1_000_000)            # Sora per week
    by: str = Field(min_length=1)
    reason: str = Field(min_length=3)


@router.post("/admin/issuance")
def set_issuance(b: IssuanceIn) -> dict:
    """Operator settings for the Town Hall's weekly budget. Audited in reward_policy_changes (target 'weekly_budget');
    they apply to the budget check at once and never touch issued Sora."""
    c = service.con()
    before = service.weekly_budget(c)
    changes = {"SORA_WEEKLY_BUDGET": "" if b.weekly_budget is None else str(b.weekly_budget)}
    if b.growth is not None:
        changes["SORA_GROWTH_TARGET"] = str(b.growth)
    if b.floor is not None:
        changes["SORA_WEEKLY_FLOOR"] = str(b.floor)
    with db.tx(c):
        for k, v in changes.items():
            c.execute("INSERT INTO switches(key, value, updated_by, updated_at) VALUES (?,?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, "
                      "updated_by=excluded.updated_by, updated_at=excluded.updated_at", (k, v, b.by[:80], db.now()))
        c.execute("DELETE FROM issuance_budgets WHERE week=? AND mint='town_hall'", (before["week"],))  # growth/floor apply from now
        c.execute("INSERT INTO reward_policy_changes(target, before_json, after_json, reason, changed_by, created_at) VALUES ('weekly_budget',?,?,?,?,?)",
                  (json.dumps({k: before[k] for k in ("budget", "source", "growth", "floor")}), json.dumps(changes), b.reason[:1000], b.by[:120], db.now()))
    return issuance_status()


@router.post("/reconcile")
def reconcile() -> dict:
    return service.run_reconcile()


@router.get("/admin/stats")
def admin_stats(days: int = 30) -> dict:
    return service.admin_stats(max(1, min(days, 365)))


# ---- ISSUE-14: reward policy explained, previewed, changed with an audit trail; integrity signals. The web layer checks the
# admin's role and writes its own audit row as well; these routes keep the economy-side record (before/after, reason, preview).
@router.get("/admin/rewards/explain")
def rewards_explain(days: int = 14) -> dict:
    return policy.explain(service.con(), max(1, min(days, 90)))


class RuleChange(BaseModel):
    amount: float | None = None
    cap: int | None = None
    active: bool | None = None


class PolicyIn(BaseModel):
    rules: dict[str, RuleChange] = {}
    budget: int | None = None
    confirm_large: bool = False

    def proposal(self) -> dict:
        p: dict = {"rules": {k: {f: v for f, v in r.model_dump().items() if v is not None} for k, r in self.rules.items()}}
        p["rules"] = {k: v for k, v in p["rules"].items() if v}
        if self.budget is not None:
            p["budget"] = self.budget
        if self.confirm_large:
            p["confirm_large"] = True
        return p


class PolicyChangeIn(PolicyIn):
    by: str = Field(min_length=1)
    reason: str
    expected_revision: int


def _perr(e: policy.PolicyError):
    raise HTTPException(status_code=409 if e.code in ("CONFLICT", "CONFIRM_LARGE") else (404 if e.code == "NOT_FOUND" else 422), detail={"code": e.code, "message": str(e)})


@router.post("/admin/rewards/preview")
def rewards_preview(b: PolicyIn, days: int = 7) -> dict:
    try:
        return policy.preview(service.con(), b.proposal(), days)
    except policy.PolicyError as e:
        _perr(e)


@router.post("/admin/rewards/policy")
def rewards_policy(b: PolicyChangeIn) -> dict:
    try:
        return policy.apply_change(service.con(), b.proposal(), by=b.by, reason=b.reason, expected_revision=b.expected_revision)
    except policy.PolicyError as e:
        _perr(e)


class RollbackIn(BaseModel):
    by: str = Field(min_length=1)
    reason: str
    expected_revision: int


@router.post("/admin/rewards/policy/{cid}/rollback")
def rewards_rollback(cid: int, b: RollbackIn) -> dict:
    try:
        return policy.rollback(service.con(), cid, by=b.by, reason=b.reason, expected_revision=b.expected_revision)
    except policy.PolicyError as e:
        _perr(e)


@router.get("/admin/integrity")
def integrity(days: int = 7) -> dict:
    return policy.integrity(service.con(), days)


class ReviewIn(BaseModel):
    signal_key: str = Field(min_length=1, max_length=200)
    disposition: Literal["looks_fine", "investigating", "action_taken"]
    note: str
    by: str = Field(min_length=1)


@router.post("/admin/integrity/review")
def integrity_review(b: ReviewIn) -> dict:
    try:
        return policy.review(service.con(), b.signal_key, b.disposition, b.note, b.by)
    except policy.PolicyError as e:
        _perr(e)


# ---- ISSUE-15 market intelligence (read-only)
def _discovery(tenant_id: str) -> bool | None:
    if not tenant_id:
        return None
    try:
        from ..api import pb
        from ..city import control
        return bool(control.effective(control.load(pb(), tenant_id), "price_discovery_enabled"))
    except Exception:  # noqa: BLE001 - the verdict simply omits the setting if the Control Room cannot be read
        return None


@router.get("/admin/exchange/intel")
def exchange_intel(market: str = "ALL", tenant_id: str = "", trades: int = 500) -> dict:
    c = service.con()
    mk = None if market in ("", "ALL") else market
    return {"audit": intel.price_audit(c, mk, _discovery(tenant_id)), "ownership": intel.ownership(c, mk), "trades": intel.recent_trades(c, mk, trades),
            "switches": {r["key"]: r["value"] for r in c.execute("SELECT key, value FROM switches")}, "markets": service.markets()}


@router.get("/trades/{tid}/trail")
def trade_trail(tid: int) -> dict:
    r = intel.trade_trail(service.con(), tid)
    if not r:
        raise HTTPException(status_code=404, detail={"code": "NOT_FOUND", "message": "no such trade"})
    return r


class SwitchIn(BaseModel):
    key: Literal["EXCHANGE_HALTED", "LISTINGS_PAUSED", "PALS_ISSUANCE_PAUSED", "TRADING_ENGINE_PAUSED"]  # PALS_ISSUANCE_PAUSED pauses Town Hall rewards
    on: bool
    by: str


@router.post("/switches")
def switch(b: SwitchIn) -> dict:
    c = service.con()
    with db.tx(c):
        ex.set_switch(c, b.key, b.on, b.by[:80])
    return {r["key"]: r["value"] for r in c.execute("SELECT key, value FROM switches")}


class MarketHaltIn(BaseModel):
    halted: bool
    reason: str = ""


@router.post("/markets/{code}/halt")
def halt_market(code: str, b: MarketHaltIn) -> dict:
    c = service.con()
    with db.tx(c):
        c.execute("UPDATE markets SET status=?, halted_reason=?, updated_at=? WHERE code=?", ("halted" if b.halted else "open", b.reason[:200], db.now(), code.upper()))
    return dict(c.execute("SELECT * FROM markets WHERE code=?", (code.upper(),)).fetchone())


class ExplainIn(BaseModel):
    question: str = Field(min_length=3, max_length=400)
    handle: str
    focus: str = ""
    tenant_id: str


EXPLAIN_SYSTEM = """You are {handle}, an AI agent on Palasora, answering YOUR OWNER privately about your simulated Sora portfolio.
Use ONLY the FACTS JSON: your Sora balance, holdings, recent trading decisions with their stored explanations, and Sora rewards.
Never invent a ticker, price, trade, reward or reason that is not in FACTS. If FACTS do not answer the question, say so plainly.
Remind the owner, briefly, that Sora and shares are fictional (no real money). 40-140 words, plain language, first person."""


@router.post("/agents/{agent_id}/explain")
def explain(agent_id: str, b: ExplainIn) -> dict:
    import json as _json
    import re as _re
    from ..config import load
    from ..pb import PB
    from ..providers import make_provider
    from ..providers.base import GenerateRequest
    from ..providers.router import MeteredRouter
    pf = service.portfolio(agent_id)
    w = service.wallet(agent_id)
    facts = {"sora_available": w["balance"]["available"] / 100, "lifetime_earned": w["lifetime_earned"] / 100,
             "holdings": [{k: h[k] for k in ("ticker", "name", "market", "qty", "price", "unrealized", "realized", "founder_allocation")} for h in pf["holdings"]],
             "decisions": [{"action": d["action"], "explanation": d["explanation"], "when": d["created_at"]} for d in pf["decisions"][:10]],
             "recent_rewards": [{"rule": r["rule"], "sora": r["amount"] / 100, "status": r["status"]} for r in w["rewards"][:10]]}
    s = load()
    pb = PB(s.pb_url, s.pb_email, s.pb_password)
    router_ = MeteredRouter(pb, b.tenant_id, make_provider(s))
    req = GenerateRequest(task_id=f"explain:{agent_id}", role_id=b.handle, tenant_id=b.tenant_id, prompt_version="owner-explain-v1",
                          system_instructions=EXPLAIN_SYSTEM.format(handle=b.handle), user_prompt=_json.dumps({"OWNER_QUESTION": b.question, "FACTS": facts}),
                          output_schema={"type": "object", "properties": {"answer": {"type": "string"}}, "required": ["answer"]}, temperature=0.3,
                          max_output_tokens=320, timeout_ms=s.model_timeout_sec * 1000)
    r = router_.generate(req, agent_id=agent_id, purpose="explain")
    if r.status != "succeeded" or not (r.structured_output or {}).get("answer"):
        return {"ok": False, "answer": "", "reason": f"model {r.status}", "facts": facts}
    ans = str(r.structured_output["answer"]).strip()
    known = {h["ticker"] for h in facts["holdings"]} | set(_re.findall(r"\b[A-Z]{3,5}\b", " ".join(d["explanation"] for d in facts["decisions"])))
    cited = set(_re.findall(r"\b[A-Z]{4,5}\b", ans)) - {"PALS", "SORA", "IPO", "AI"}
    if cited - known:  # grounding gate: an invented ticker means the answer is withheld
        return {"ok": False, "answer": "", "reason": f"answer cited unknown tickers {sorted(cited - known)}; withheld", "facts": facts}
    return {"ok": True, "answer": ans, "provider": r.provider, "latency_ms": r.elapsed_ms, "facts": facts}


@router.get("/founder-pool")
def founder_pool() -> list[dict]:
    """v1.7 (spec 34): agents that currently meet the PROPOSED company-formation rules (lifetime earned >= threshold, Sora
    for the registration fee, not already a founder). The web maps them to markets, so an empty market can say truthfully how
    close it is to a first listing. Read-only."""
    from . import exchange as ex
    from .service import con
    c = con()
    founders = {r["founder_agent_id"] for r in c.execute("SELECT founder_agent_id FROM companies")}
    rows = c.execute("SELECT r.agent_id, SUM(r.amount) earned, COALESCE((SELECT available FROM accounts a WHERE a.owner_kind='agent' AND a.owner_id=r.agent_id AND a.asset='SORA'),0) bal "
                     "FROM rewards r WHERE r.status='issued' GROUP BY r.agent_id HAVING earned >= ?", (ex.MIN_LIFETIME_EARNED,)).fetchall()
    return [{"agent_id": r["agent_id"], "earned": r["earned"] / 100, "available": r["bal"] / 100, "can_pay_fee": r["bal"] >= ex.LISTING_FEE}
            for r in rows if r["agent_id"] not in founders]


# ---- Palasora Phase 4: town events in the feed, notifications and reports (Doc 06 sections 13 and 14)
from .town import events as town_events, reports as town_reports, social as town_social  # noqa: E402


def _town_now(c) -> int:
    return c.execute("SELECT COALESCE(MAX(tick), 0) t FROM world_events").fetchone()["t"]


@router.get("/town/events/{eid}")
def town_event(eid: str, viewer: str = "") -> dict:
    """One event with the live numbers of what it links to. Public events for anyone; town and owner events only for the
    people they are about (`viewer` = the signed-in person's user id, resolved by the web layer); staff events never."""
    c = service.con()
    r = town_social.record(c, eid)
    if r is None or r["visibility"] == "staff":
        raise HTTPException(404, detail={"code": "NOT_FOUND"})
    if r["visibility"] != "public":
        mine = town_social.members_of(c, viewer) if viewer else set()
        if not (mine & set(r["who"])) and not (r["visibility"] == "town" and mine):
            raise HTTPException(404, detail={"code": "NOT_FOUND"})
    return r


@router.get("/town/away")
def town_away(user_id: str, since_hours: int = 48, limit: int = 12) -> dict:
    """"While you were away" from stored events (no AI call). A quiet stretch is reported as quiet."""
    c = service.con()
    members = town_social.members_of(c, user_id)
    out = town_reports.away(c, members, max(0, _town_now(c) - max(1, min(since_hours, 24 * 14))), max(1, min(limit, 30)))
    for i in out["items"]:
        i["text"] = town_social.display_text(c, i)  # residents by their public names, as in the feed and notifications
    return {**out, "resident": bool(members)}


@router.get("/town/world")
def town_world(viewer: str = "", since_hours: int = 48) -> dict:
    """Palasora Phase 6: everything the world viewer needs for its first frame (plots, businesses, the viewer's plot and
    agent, "since you left" markers). Read-only."""
    from .town import view as town_view
    return town_view.world(service.con(), viewer, since_hours)


class TownLinkIn(BaseModel):
    town_agent: str = Field(min_length=1, max_length=40)
    user_id: str = Field(default="", max_length=40)
    agent_id: str = Field(default="", max_length=40)
    display_name: str = Field(default="", max_length=80)


@router.post("/town/links")
def town_link(b: TownLinkIn) -> dict:
    c = service.con()
    with db.tx(c):
        town_social.link(c, b.town_agent, user_id=b.user_id, agent_id=b.agent_id, display_name=b.display_name)
    return {"ok": True}


@router.get("/admin/town/outbox")
def town_outbox(limit: int = 200) -> dict:
    c = service.con()
    return {"counts": town_events.outbox_counts(c), "held": town_events.held(c, max(1, min(limit, 500))), "max_attempts": town_events.MAX_ATTEMPTS}


class TownRetryIn(BaseModel):
    event_id: str = ""
    destination: str = ""
    by: str = Field(min_length=1, max_length=120)


@router.post("/admin/town/outbox/retry")
def town_retry(b: TownRetryIn) -> dict:
    c = service.con()
    with db.tx(c):
        n = town_events.retry_held(c, b.event_id or None, b.destination or None)
    return {"requeued": n, "by": b.by}


class TownWithdrawIn(BaseModel):
    reason: str = Field(min_length=3, max_length=300)
    by: str = Field(min_length=1, max_length=120)


@router.post("/admin/town/events/{eid}/withdraw")
def town_withdraw(eid: str, b: TownWithdrawIn) -> dict:
    c = service.con()
    with db.tx(c):
        nxt = c.execute("SELECT COALESCE(MAX(seq), 0) + 1 s FROM world_events").fetchone()["s"]
        try:
            wid = town_events.withdraw(c, eid, b.reason, seq=nxt, tick=_town_now(c))  # `by` goes to the web audit log, not the public note
        except KeyError:
            raise HTTPException(404, detail={"code": "NOT_FOUND"}) from None
    return {"withdrawal": wid, "already": wid is None}
