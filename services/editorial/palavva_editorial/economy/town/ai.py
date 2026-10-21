"""Agents' AI plans: recorded, live and fixture planners (Doc 04 section 6; Doc 05 section 5).

An AI answer is only a list of proposed actions; it still goes through the Actions gate like anything else.

The prompt is built from a bucketed view of the business (type, price against the reference, how fast it sells, input
cover, recent profit, how crowded its trade is, staffing, cash), so the same situation always gives the same prompt and
the same hash. That keeps recordings small and replayable across seeds: `RecordedPlanner` plays back the saved answer
for a prompt hash; a missing answer falls back to rules and the run counts it. `LivePlanner` calls a real model through
a provider (the OpenRouter writer and its spend ledger in production), saves the answer and its cost. `FixturePlanner`
is a deterministic stand-in labelled `fixture` (like providers/fixture.py): it is never evidence that a real model works.
"""
from __future__ import annotations

import hashlib
import json
import time
from itertools import product
from pathlib import Path


PROMPT_VERSION = "town-plan-v1"
RECORDINGS = Path(__file__).resolve().parent / "recordings"
BUCKETS = {
    "price": ("low", "normal", "high"),          # own price against the reference
    "sales": ("sold_out", "steady", "slow"),     # turned customers away / sold most / left stock
    "cover": ("out", "low", "ok"),               # days of input on hand and on the way
    "profit": ("loss", "thin", "good"),          # last 3 days
    "crowd": ("short", "balanced", "crowded"),   # supply of its trade against demand
}
TYPES = ("stall", "farm", "workshop", "delivery")
SYSTEM = ("You run a small business in a fictional town economy (Palasora). Reply with JSON only: "
          '{"price": "+8%"|"+4%"|"hold"|"-4%"|"-8%", "staff": "hire"|"hold"|"fire", "stock_days": 1|2|3|4, "close": true|false, "note": "<12 words>"}. '
          "Keep the business profitable, avoid running out, and do not chase prices more than needed.")
ANSWER_SCHEMA = {"type": "object", "properties": {"price": {"enum": ["+8%", "+4%", "hold", "-4%", "-8%"]}, "staff": {"enum": ["hire", "hold", "fire"]},
                                                  "stock_days": {"enum": [1, 2, 3, 4]}, "close": {"type": "boolean"}, "note": {"type": "string"}},
                 "required": ["price", "staff", "stock_days", "close"]}


def prompt_text(btype: str, buckets: dict, trigger: str) -> str:
    lines = [f"Business: {btype}", f"Trigger: {trigger}"] + [f"{k}: {buckets[k]}" for k in BUCKETS]
    return "\n".join(lines)


def prompt_hash(btype: str, buckets: dict, trigger: str) -> str:
    return hashlib.sha256(f"{PROMPT_VERSION}\n{SYSTEM}\n{prompt_text(btype, buckets, trigger)}".encode()).hexdigest()[:24]


def all_prompts(triggers=("plan", "event")):
    for t, trig in product(TYPES, triggers):
        for combo in product(*BUCKETS.values()):
            yield t, dict(zip(BUCKETS, combo)), trig


def tokens(text: str) -> int:
    return max(1, len(text) // 4)


def fixture_answer(btype: str, b: dict, trigger: str) -> dict:
    """The fixture planner: a deterministic analyst. It looks at margin and crowding together, which the hourly rules
    do not, and reacts harder to a loss streak."""
    price, staff, close = "hold", "hold", False
    if b["sales"] == "sold_out":
        price = "+8%" if b["crowd"] == "short" else "+4%"
        staff = "hire" if b["profit"] != "loss" else "hold"
    elif b["sales"] == "slow":
        # in a crowded trade a price war only thins every margin: cut costs first, and cut price only from high
        if b["crowd"] == "crowded":
            price = "-4%" if b["price"] == "high" else "hold"
            staff = "fire" if b["profit"] != "good" else "hold"
        else:
            price = "-4%" if b["price"] != "low" else "hold"
            staff = "fire" if b["profit"] == "loss" else "hold"
    elif b["profit"] == "loss":
        price = "+4%" if b["price"] == "low" else "-4%" if b["crowd"] == "crowded" else "hold"
    if b["price"] == "high" and price.startswith("+"):
        price = "hold"
    if b["price"] == "low" and price.startswith("-"):
        price = "hold"
    stock = {"out": 4, "low": 3, "ok": 2}[b["cover"]]
    if btype == "delivery":
        stock = 1
    note = {"sold_out": "demand is ahead of supply", "slow": "stock is sitting", "steady": "keep steady"}[b["sales"]]
    return {"price": price, "staff": staff, "stock_days": stock, "close": close, "note": note}


class RecordedPlanner:
    mode = "recorded"

    def __init__(self, path: Path | None = None):
        self.path = path or (RECORDINGS / "plans-v1.json")
        data = json.loads(self.path.read_text()) if self.path.exists() else {"meta": {}, "answers": {}}
        self.meta, self.answers = data.get("meta", {}), data.get("answers", {})

    def plan(self, btype: str, buckets: dict, trigger: str) -> tuple[dict | None, dict]:
        h = prompt_hash(btype, buckets, trigger)
        rec = self.answers.get(h)
        meta = {"prompt_hash": h, "tokens_in": tokens(SYSTEM + prompt_text(btype, buckets, trigger)), "tokens_out": 0, "cost_usd": 0.0,
                "fallback": rec is None, "source": self.meta.get("provider", "")}
        if rec is None:
            return None, meta
        meta["tokens_out"] = rec.get("tokens_out", tokens(json.dumps(rec["answer"])))
        meta["recorded_cost_usd"] = rec.get("cost_usd", 0.0)
        return rec["answer"], meta


class LivePlanner:
    """Calls a real model (any providers.base.ModelProvider). Every answer is saved so later runs can replay it."""
    mode = "live"

    def __init__(self, provider, save_to: Path | None = None, max_calls: int = 200):
        self.provider, self.save_to, self.max_calls = provider, save_to, max_calls
        self.calls, self.cost, self.saved = 0, 0.0, {}

    def plan(self, btype: str, buckets: dict, trigger: str) -> tuple[dict | None, dict]:
        from ...providers.base import GenerateRequest
        h = prompt_hash(btype, buckets, trigger)
        meta = {"prompt_hash": h, "tokens_in": 0, "tokens_out": 0, "cost_usd": 0.0, "fallback": True, "source": getattr(self.provider, "name", "")}
        if self.calls >= self.max_calls:
            return None, meta
        self.calls += 1
        req = GenerateRequest(task_id=f"town-plan-{h}", role_id="town_planner", tenant_id="palasora", prompt_version=PROMPT_VERSION,
                              system_instructions=SYSTEM, user_prompt=prompt_text(btype, buckets, trigger), output_schema=ANSWER_SCHEMA,
                              temperature=0.0, max_output_tokens=120, idempotency_key=h)
        res = self.provider.generate(req)
        meta.update(tokens_in=res.input_tokens or tokens(SYSTEM + req.user_prompt), tokens_out=res.output_tokens or 0, cost_usd=float(res.estimated_cost or 0.0))
        self.cost += meta["cost_usd"]
        ans = res.structured_output if res.status == "succeeded" else None
        if ans and validate(ans):
            meta["fallback"] = False
            self.saved[h] = {"answer": ans, "tokens_in": meta["tokens_in"], "tokens_out": meta["tokens_out"], "cost_usd": meta["cost_usd"],
                             "model": res.model, "at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}
            return ans, meta
        return None, meta


def validate(ans: dict) -> bool:
    try:
        return (ans["price"] in ("+8%", "+4%", "hold", "-4%", "-8%") and ans["staff"] in ("hire", "hold", "fire")
                and int(ans["stock_days"]) in (1, 2, 3, 4) and isinstance(ans["close"], bool))
    except (KeyError, TypeError, ValueError):
        return False


def record_fixture(path: Path) -> dict:
    """Write recordings for every prompt from the fixture planner (labelled as such)."""
    answers = {}
    for t, b, trig in all_prompts():
        a = fixture_answer(t, b, trig)
        answers[prompt_hash(t, b, trig)] = {"answer": a, "tokens_in": tokens(SYSTEM + prompt_text(t, b, trig)), "tokens_out": tokens(json.dumps(a)),
                                            "cost_usd": 0.0, "model": "deterministic-fixture-v1", "type": t, "buckets": b, "trigger": trig}
    data = {"meta": {"provider": "fixture", "model": "deterministic-fixture-v1", "prompt_version": PROMPT_VERSION,
                     "note": "Recorded from the deterministic fixture planner, not from a real model. Re-record with a live provider "
                             "(sim record --provider openrouter) to test real AI plans.", "prompts": len(answers)},
            "answers": answers}
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=0, sort_keys=True))
    return data["meta"]


# Price list used to estimate cost from token counts when no live call was made (USD per million tokens). The live
# path always uses the provider-reported cost instead.
# These are ASSUMED list prices for an estimate only; confirm against the live OpenRouter catalogue (providers/openrouter.price).
PRICE_PER_MTOK = {"anthropic/claude-haiku-5.5": (1.00, 5.00), "openai/gpt-oss-20b": (0.05, 0.20), "openai/gpt-5-nano": (0.05, 0.40)}
DEFAULT_MODEL = "anthropic/claude-haiku-5.5"   # OPENROUTER_MODEL's default in providers/openrouter.py


def estimate_usd(tokens_in: int, tokens_out: int, model: str = DEFAULT_MODEL) -> float:
    pin, pout = PRICE_PER_MTOK[model]
    return tokens_in / 1e6 * pin + tokens_out / 1e6 * pout

