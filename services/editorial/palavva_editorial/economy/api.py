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
