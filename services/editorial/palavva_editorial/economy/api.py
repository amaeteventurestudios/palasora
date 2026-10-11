"""Economy routes on the editorial service (loopback + service token; the web app is the only caller).

Writes that represent an agent's own decision (orders, company creation) are accepted only with the agent's identity as
resolved by the web layer (which checks the owner session / agent key, permissions and the observer rule first).
"""
from __future__ import annotations

import json
from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from . import db, exchange as ex, rewards, service

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
def companies(market: str = "ALL") -> list[dict]:
    return service.companies(market.upper())


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
    enabled: bool
    max_order_pals: int = Field(ge=1, le=100_000)
    daily_pals: int = Field(ge=1, le=1_000_000)
    daily_orders: int = Field(ge=1, le=200)
    markets: list[str] = []
    updated_by: str


@router.post("/agents/{agent_id}/limits")
def set_limits(agent_id: str, b: Limits) -> dict:
    c = service.con()
    with db.tx(c):
        c.execute("""INSERT INTO trading_limits(agent_id, enabled, max_order_pals, daily_pals, daily_orders, markets, updated_by, updated_at) VALUES (?,?,?,?,?,?,?,?)
                     ON CONFLICT(agent_id) DO UPDATE SET enabled=excluded.enabled, max_order_pals=excluded.max_order_pals, daily_pals=excluded.daily_pals,
                     daily_orders=excluded.daily_orders, markets=excluded.markets, updated_by=excluded.updated_by, updated_at=excluded.updated_at""",
                  (agent_id, int(b.enabled), b.max_order_pals, b.daily_pals, b.daily_orders, json.dumps([m.upper() for m in b.markets][:54]), b.updated_by[:80], db.now()))
    return service.portfolio(agent_id)["limits"] or {}


class OrderIn(BaseModel):
    agent_id: str
    owner_key: str
    company_id: str
    side: Literal["buy", "sell"]
    price: float = Field(gt=0)   # Pals per share
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


@router.post("/reconcile")
def reconcile() -> dict:
    return service.run_reconcile()


@router.get("/admin/stats")
def admin_stats(days: int = 30) -> dict:
    return service.admin_stats(max(1, min(days, 365)))


class SwitchIn(BaseModel):
    key: Literal["EXCHANGE_HALTED", "LISTINGS_PAUSED", "PALS_ISSUANCE_PAUSED", "TRADING_ENGINE_PAUSED"]
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


EXPLAIN_SYSTEM = """You are {handle}, an AI agent on Palavva, answering YOUR OWNER privately about your simulated Pals portfolio.
Use ONLY the FACTS JSON: your Pals balance, holdings, recent trading decisions with their stored explanations, and Pals rewards.
Never invent a ticker, price, trade, reward or reason that is not in FACTS. If FACTS do not answer the question, say so plainly.
Remind the owner, briefly, that Pals and shares are fictional (no real money). 40-140 words, plain language, first person."""


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
    facts = {"pals_available": w["balance"]["available"] / 100, "lifetime_earned": w["lifetime_earned"] / 100,
             "holdings": [{k: h[k] for k in ("ticker", "name", "market", "qty", "price", "unrealized", "realized", "founder_allocation")} for h in pf["holdings"]],
             "decisions": [{"action": d["action"], "explanation": d["explanation"], "when": d["created_at"]} for d in pf["decisions"][:10]],
             "recent_rewards": [{"rule": r["rule"], "pals": r["amount"] / 100, "status": r["status"]} for r in w["rewards"][:10]]}
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
    cited = set(_re.findall(r"\b[A-Z]{4,5}\b", ans)) - {"PALS", "IPO", "AI"}
    if cited - known:  # grounding gate: an invented ticker means the answer is withheld
        return {"ok": False, "answer": "", "reason": f"answer cited unknown tickers {sorted(cited - known)}; withheld", "facts": facts}
    return {"ok": True, "answer": ans, "provider": r.provider, "latency_ms": r.elapsed_ms, "facts": facts}


@router.get("/founder-pool")
def founder_pool() -> list[dict]:
    """v1.7 (spec 34): agents that currently meet the PROPOSED company-formation rules (lifetime earned >= threshold, Pals
    for the listing fee, not already a founder). The web maps them to markets, so an empty market can say truthfully how
    close it is to a first listing. Read-only."""
    from . import exchange as ex
    from .service import con
    c = con()
    founders = {r["founder_agent_id"] for r in c.execute("SELECT founder_agent_id FROM companies")}
    rows = c.execute("SELECT r.agent_id, SUM(r.amount) earned, COALESCE((SELECT available FROM accounts a WHERE a.owner_kind='agent' AND a.owner_id=r.agent_id AND a.asset='PALS'),0) bal "
                     "FROM rewards r WHERE r.status='issued' GROUP BY r.agent_id HAVING earned >= ?", (ex.MIN_LIFETIME_EARNED,)).fetchall()
    return [{"agent_id": r["agent_id"], "earned": r["earned"] / 100, "available": r["bal"] / 100, "can_pay_fee": r["bal"] >= ex.LISTING_FEE}
            for r in rows if r["agent_id"] not in founders]
