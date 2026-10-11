"""OpenRouter writer for the founder-authorised overnight experiment (v1.6; $10 maximum, $8 operational cutoff).

Every gate below must pass before a paid request is sent; any failure blocks the call (fail closed) and is metered:

  1. OPENROUTER_EXPERIMENT_ENABLED=true and OPENROUTER_API_KEY present (read from the git-ignored .env.local only).
  2. The key is NOT on the local compromised-key denylist (`<data>/run/compromised-keys.sha256`, SHA-256 fingerprints,
     never the key itself). The key exposed in an earlier chat is on that list, so it can never activate paid inference.
  3. A PocketBase `model_budgets` row key='openrouter' with status='open', a non-empty authorized_by and limit_usd.
     The hard cap is min(limit_usd, OPENROUTER_MAX_USD=10); paid calls stop at the CUTOFF min(cap, OPENROUTER_CUTOFF_USD=8).
  4. The tenant kill switch OPENROUTER_PAUSED is not on and the local ledger has not tripped.
  5. Authentication was validated against GET /api/v1/key, and the provider-reported usage since the experiment
     baseline is below the cutoff (re-checked at least every OPENROUTER_RECONCILE_SEC).
  6. RESERVATION: the call's worst-case cost (estimated input + max_tokens output, at the live catalogue price) is
     reserved atomically in a SQLite ledger shared by every thread and process. Spent + outstanding reservations +
     worst case must fit under the cutoff. After the call the reservation is settled at the provider-reported cost
     (`usage.cost`); a timeout or unknown outcome is settled at the WORST CASE, never at zero.

Retry rule: a request the provider demonstrably did not process (connection refused before sending, HTTP 429 or 503
with no usage) may be retried ONCE after a short backoff. Timeouts and any response with usage are never retried.
There is no automatic top-up path: this module only ever spends existing credit and never calls a payment API.
"""
from __future__ import annotations

import hashlib
import json
import logging
import os
import sqlite3
import threading
import time
import uuid
from pathlib import Path

import httpx

from .base import GenerateRequest, GenerateResult

log = logging.getLogger("palavva.openrouter")
BASE = "https://openrouter.ai/api/v1"
HARD_MAX_USD = 10.0
PROVIDER = "openrouter"

# Reasoning control per model family: the experiment wants short social text, so hidden reasoning is minimised
# where the model allows it (reasoning tokens are billed as output).
REASONING = {"openai/gpt-5-nano": {"effort": "minimal", "exclude": True}, "openai/gpt-oss-20b": {"effort": "low", "exclude": True},
             "openai/gpt-oss-120b": {"effort": "low", "exclude": True}}


def _f(name: str, d: float) -> float:
    try:
        return float(os.environ.get(name, str(d)))
    except ValueError:
        return d


def data_dir() -> Path:
    return Path(os.environ.get("PALAVVA_DATA_DIR", "./data")).resolve()


def fingerprint(key: str) -> str:
    return hashlib.sha256(key.encode()).hexdigest()


def denylisted(key: str) -> bool:
    p = data_dir() / "run" / "compromised-keys.sha256"
    try:
        return fingerprint(key) in {ln.strip() for ln in p.read_text().splitlines() if ln.strip() and not ln.startswith("#")}
    except FileNotFoundError:
        return False


# --------------------------------------------------------------------------------------------- spend ledger

class SpendLedger:
    """Atomic reservation ledger (SQLite, BEGIN IMMEDIATE) shared by all writer threads and processes."""

    def __init__(self, path: Path | None = None):
        self.path = Path(path or data_dir() / "spend.db")
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self._c() as c:
            c.executescript("""
            CREATE TABLE IF NOT EXISTS calls (id TEXT PRIMARY KEY, provider TEXT, model TEXT, agent_id TEXT, purpose TEXT, worst_usd REAL,
              actual_usd REAL, status TEXT, tokens_in INTEGER DEFAULT 0, tokens_out INTEGER DEFAULT 0, latency_ms INTEGER DEFAULT 0,
              request_id TEXT DEFAULT '', error TEXT DEFAULT '', created_at REAL, settled_at REAL);
            CREATE INDEX IF NOT EXISTS idx_calls_status ON calls(status);
            CREATE TABLE IF NOT EXISTS state (key TEXT PRIMARY KEY, value TEXT, updated_at REAL);
            """)

    def _c(self) -> sqlite3.Connection:
        c = sqlite3.connect(self.path, timeout=30, isolation_level=None)
        c.row_factory = sqlite3.Row
        c.execute("PRAGMA journal_mode=WAL")
        return c

    def get(self, key: str, default: str = "") -> str:
        with self._c() as c:
            r = c.execute("SELECT value FROM state WHERE key=?", (key,)).fetchone()
            return r["value"] if r else default

    def put(self, key: str, value: str) -> None:
        with self._c() as c:
            c.execute("INSERT INTO state(key, value, updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at",
                      (key, value, time.time()))

    def committed(self, c: sqlite3.Connection | None = None) -> float:
        """Settled actual cost + worst case of everything still reserved or unknown."""
        own = c is None
        c = c or self._c()
        try:
            r = c.execute("SELECT COALESCE(SUM(CASE WHEN status='settled' THEN actual_usd WHEN status IN ('reserved','unknown') THEN worst_usd ELSE 0 END),0) v FROM calls").fetchone()
            return float(r["v"])
        finally:
            if own:
                c.close()

    def reserve(self, *, model: str, agent_id: str, purpose: str, worst: float, cutoff: float) -> tuple[str | None, float]:
        c = self._c()
        try:
            c.execute("BEGIN IMMEDIATE")
            if self.get_in(c, "killed"):
                c.execute("ROLLBACK")
                return None, self.committed()
            cur = self.committed(c)
            if cur + worst > cutoff:
                c.execute("INSERT INTO state(key, value, updated_at) VALUES ('killed', ?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at",
                          (f"cutoff ${cutoff:.2f} reached: committed ${cur:.6f} + next worst case ${worst:.6f}", time.time()))
                c.execute("COMMIT")
                return None, cur
            rid = uuid.uuid4().hex
            c.execute("INSERT INTO calls(id, provider, model, agent_id, purpose, worst_usd, actual_usd, status, created_at) VALUES (?,?,?,?,?,?,0,'reserved',?)",
                      (rid, PROVIDER, model, agent_id, purpose, worst, time.time()))
            c.execute("COMMIT")
            return rid, cur + worst
        except Exception:
            try:
                c.execute("ROLLBACK")
            except sqlite3.Error:
                pass
            raise
        finally:
            c.close()

    @staticmethod
    def get_in(c: sqlite3.Connection, key: str) -> str:
        r = c.execute("SELECT value FROM state WHERE key=?", (key,)).fetchone()
        return r["value"] if r else ""

    def settle(self, rid: str, *, status: str, actual: float | None = None, tokens_in: int = 0, tokens_out: int = 0, latency_ms: int = 0,
               request_id: str = "", error: str = "") -> None:
        """status: settled (actual known) | unknown (keep worst case) | released (provably not sent: costs nothing)."""
        with self._c() as c:
            c.execute("UPDATE calls SET status=?, actual_usd=COALESCE(?, actual_usd), tokens_in=?, tokens_out=?, latency_ms=?, request_id=?, error=?, settled_at=? WHERE id=?",
                      (status, actual, tokens_in, tokens_out, latency_ms, request_id, error[:500], time.time(), rid))

    def kill(self, reason: str) -> None:
        self.put("killed", reason)

    def summary(self) -> dict:
        with self._c() as c:
            by_model = [dict(r) for r in c.execute("SELECT model, COUNT(*) calls, SUM(status='settled') ok, SUM(tokens_in) tin, SUM(tokens_out) tout, "
                                                   "ROUND(SUM(CASE WHEN status='settled' THEN actual_usd ELSE 0 END), 6) usd, "
                                                   "CAST(AVG(CASE WHEN status='settled' THEN latency_ms END) AS INTEGER) avg_ms FROM calls GROUP BY model")]
            return {"committed_usd": round(self.committed(c), 6), "killed": self.get_in(c, "killed"), "by_model": by_model,
                    "unknown": c.execute("SELECT COUNT(*) n FROM calls WHERE status='unknown'").fetchone()["n"],
                    "reserved": c.execute("SELECT COUNT(*) n FROM calls WHERE status='reserved'").fetchone()["n"],
                    "provider_baseline": self.get_in(c, "provider_baseline_usd"), "provider_usage": self.get_in(c, "provider_usage_usd")}


# --------------------------------------------------------------------------------------------- catalogue

_catalog: dict[str, dict] = {}
_catalog_at = 0.0
_cat_lock = threading.Lock()


def catalog(client: httpx.Client | None = None, max_age: float = 6 * 3600) -> dict[str, dict]:
    """Live OpenRouter model list (public endpoint, no key sent), cached on disk for restarts."""
    global _catalog, _catalog_at
    with _cat_lock:
        if _catalog and time.time() - _catalog_at < max_age:
            return _catalog
        path = data_dir() / "run" / "openrouter-models.json"
        try:
            r = (client or httpx).get(f"{BASE}/models", timeout=20)
            r.raise_for_status()
            rows = r.json()["data"]
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(json.dumps({"fetched_at": time.time(), "data": rows}))
        except (httpx.HTTPError, ValueError, KeyError):
            try:
                rows = json.loads(path.read_text())["data"]
            except (FileNotFoundError, ValueError, KeyError):
                rows = []
        _catalog = {m["id"]: m for m in rows}
        _catalog_at = time.time()
        return _catalog


def price(model: str, client: httpx.Client | None = None) -> tuple[float, float] | None:
    """USD per token (input, output) from the live catalogue; None when the model is not listed (call blocked)."""
    m = catalog(client).get(model)
    if not m:
        return None
    p = m.get("pricing") or {}
    try:
        pin, pout = float(p.get("prompt") or 0), float(p.get("completion") or 0)
    except ValueError:
        return None
    return (pin, pout) if pin > 0 and pout > 0 else None


def cheapest(prefixes=("openai/", "anthropic/"), in_tokens: int = 900, out_tokens: int = 220, client: httpx.Client | None = None) -> list[dict]:
    """Eligible interactive models (no :batch / :free variants) ranked by expected cost per call."""
    out = []
    for mid, m in catalog(client).items():
        if not mid.startswith(prefixes) or ":" in mid:
            continue
        pr = price(mid, client)
        if not pr or "structured_outputs" not in (m.get("supported_parameters") or []) and "response_format" not in (m.get("supported_parameters") or []):
            continue
        out.append({"model": mid, "in_per_m": pr[0] * 1e6, "out_per_m": pr[1] * 1e6, "expected_call_usd": in_tokens * pr[0] + out_tokens * pr[1],
                    "reasoning": "reasoning" in (m.get("supported_parameters") or [])})
    return sorted(out, key=lambda r: r["expected_call_usd"])


# --------------------------------------------------------------------------------------------- writer

def strict_schema(schema: dict) -> dict:
    s = json.loads(json.dumps(schema))
    if s.get("type") == "object":
        s["additionalProperties"] = False
        s["required"] = list((s.get("properties") or {}).keys())
        for k, v in (s.get("properties") or {}).items():
            if isinstance(v, dict) and v.get("type") == "object":
                s["properties"][k] = strict_schema(v)
    return s


class OpenRouterWriter:
    name = PROVIDER

    def __init__(self, meter, ledger: SpendLedger | None = None, client: httpx.Client | None = None, model: str | None = None):
        self.meter = meter
        self.ledger = ledger or SpendLedger()
        self.client = client or httpx.Client(timeout=httpx.Timeout(_f("OPENROUTER_TIMEOUT_SEC", 40), connect=8))
        self.model = model or os.environ.get("OPENROUTER_MODEL", "anthropic/claude-haiku-5.5")
        self.sem = threading.BoundedSemaphore(max(1, int(_f("OPENROUTER_MAX_CONCURRENCY", 6))))
        self._auth_ok_at = 0.0
        self._auth_lock = threading.Lock()
        self._blocked_logged: dict[str, float] = {}

    # ---- configuration
    @staticmethod
    def key() -> str:
        return os.environ.get("OPENROUTER_API_KEY", "").strip()

    def caps(self) -> tuple[float, float, dict | None]:
        b = self.meter.budget("openrouter")
        limit = float((b or {}).get("limit_usd") or 0)
        cap = min(limit, _f("OPENROUTER_MAX_USD", HARD_MAX_USD), HARD_MAX_USD)
        return cap, min(cap, _f("OPENROUTER_CUTOFF_USD", 8.0)), b

    def headers(self) -> dict:
        return {"Authorization": f"Bearer {self.key()}", "HTTP-Referer": "http://127.0.0.1:3000", "X-Title": "Palavva local experiment"}

    def validate_auth(self, force: bool = False) -> str:
        """GET /key: authenticates and reconciles the provider's own usage figure. Returns '' or a blocking reason."""
        with self._auth_lock:
            if not force and time.time() - self._auth_ok_at < _f("OPENROUTER_RECONCILE_SEC", 60):
                return ""
            try:
                r = self.client.get(f"{BASE}/key", headers=self.headers(), timeout=15)
            except httpx.HTTPError as e:
                return f"blocked_policy: auth check unreachable ({type(e).__name__})"
            if r.status_code in (401, 403):
                self.ledger.kill(f"provider rejected the key (HTTP {r.status_code})")
                return f"blocked_no_key: provider rejected the key (HTTP {r.status_code})"
            if r.status_code != 200:
                return f"blocked_policy: auth check HTTP {r.status_code}"
            d = (r.json() or {}).get("data") or {}
            usage = float(d.get("usage") or 0)
            if not self.ledger.get("provider_baseline_usd"):
                self.ledger.put("provider_baseline_usd", f"{usage:.6f}")
            self.ledger.put("provider_usage_usd", f"{usage:.6f}")
            self.ledger.put("provider_limit", json.dumps({"limit": d.get("limit"), "limit_remaining": d.get("limit_remaining"), "is_free_tier": d.get("is_free_tier"),
                                                          "label": "(redacted)", "checked_at": time.time()}))
            _, cutoff, _ = self.caps()
            delta = usage - float(self.ledger.get("provider_baseline_usd") or usage)
            if delta >= cutoff:
                self.ledger.kill(f"provider-reported usage ${delta:.4f} since baseline reached cutoff ${cutoff:.2f}")
                return "blocked_budget: provider-reported usage reached the cutoff"
            self._auth_ok_at = time.time()
            return ""

    def gate(self) -> str:
        if os.environ.get("OPENROUTER_EXPERIMENT_ENABLED", "false").lower() != "true":
            return "blocked_policy: OPENROUTER_EXPERIMENT_ENABLED is not true"
        k = self.key()
        if not k:
            return "blocked_no_key: OPENROUTER_API_KEY is not configured"
        if denylisted(k):
            return "blocked_policy: the configured key is on the compromised-key denylist; generate a new key"
        cap, cutoff, b = self.caps()
        if not b or b.get("status") != "open" or not b.get("authorized_by") or cap <= 0:
            return "blocked_policy: no open, authorised model_budgets row 'openrouter'"
        killed = self.ledger.get("killed")
        if killed:
            return f"blocked_budget: {killed}"
        try:
            from ..pb import q
            r = self.meter.pb.first("tenant_settings", f"tenant_id={q(self.meter.tid)} && key='OPENROUTER_PAUSED'")
            if r and r.get("value") is True:
                return "blocked_policy: OPENROUTER_PAUSED switch on"
        except Exception:  # noqa: BLE001 - switch unreadable: fail closed
            return "blocked_policy: kill-switch state unreadable"
        if price(self.model, self.client) is None:
            return f"blocked_policy: {self.model} has no live price in the OpenRouter catalogue"
        return self.validate_auth()

    def _record(self, purpose: str, agent_id: str, event_id: str, status: str, **kw) -> None:
        self.meter.record(provider=PROVIDER, model=self.model, purpose=purpose, agent_id=agent_id, event_id=event_id, status=status, **kw)

    def generate(self, req: GenerateRequest, agent_id: str = "", purpose: str = "write", event_id: str = "") -> GenerateResult:
        why = self.gate()
        if why:
            # Blocked attempts are metered, but at most once a minute per reason (no paid call was made; avoids flooding).
            if time.time() - self._blocked_logged.get(why, 0) > 60:
                self._blocked_logged[why] = time.time()
                self._record(purpose, agent_id, event_id, why.split(":")[0], error=why)
            return GenerateResult("disabled", None, PROVIDER, self.model, 0, error_code=why)
        pin, pout = price(self.model, self.client)
        est_in = (len(req.system_instructions) + len(req.user_prompt)) // 3 + 60
        worst = est_in * pin + req.max_output_tokens * pout
        if worst > _f("OPENROUTER_PER_CALL_MAX_USD", 0.01):
            self._record(purpose, agent_id, event_id, "blocked_budget", error=f"worst case ${worst:.5f} over per-call max")
            return GenerateResult("disabled", None, PROVIDER, self.model, 0, error_code="PER_CALL_MAX")
        _, cutoff, _ = self.caps()
        rid, committed = self.ledger.reserve(model=self.model, agent_id=agent_id, purpose=purpose, worst=worst, cutoff=cutoff)
        if not rid:
            try:
                b = self.meter.budget("openrouter")
                if b and b.get("status") == "open":
                    self.meter.pb.update("model_budgets", b["id"], {"status": "exhausted", "note": f"cutoff reached at committed ${committed:.4f}"})
            except Exception:  # noqa: BLE001
                pass
            self._record(purpose, agent_id, event_id, "blocked_budget", error=f"cutoff ${cutoff:.2f} reached (committed ${committed:.4f})")
            return GenerateResult("disabled", None, PROVIDER, self.model, 0, error_code="BUDGET_CUTOFF")
        body = {"model": self.model, "max_tokens": req.max_output_tokens, "temperature": req.temperature,
                "messages": [{"role": "system", "content": req.system_instructions}, {"role": "user", "content": req.user_prompt}],
                "response_format": {"type": "json_schema", "json_schema": {"name": "palavva_output", "strict": True, "schema": strict_schema(req.output_schema)}},
                "usage": {"include": True},
                # Never route to a provider priced above the catalogue price used for the reservation (USD per million tokens).
                "provider": {"max_price": {"prompt": round(pin * 1e6, 6), "completion": round(pout * 1e6, 6)}, "require_parameters": True}}
        if self.model in REASONING:
            body["reasoning"] = REASONING[self.model]
        t0 = time.time()
        attempt = 0
        with self.sem:
            while True:
                try:
                    r = self.client.post(f"{BASE}/chat/completions", headers=self.headers(), json=body, timeout=req.timeout_ms / 1000)
                except httpx.ConnectError as e:
                    if attempt == 0:  # not sent: one retry is safe
                        attempt += 1
                        time.sleep(1.5)
                        continue
                    self.ledger.settle(rid, status="released", error=f"connect: {e}")
                    self._record(purpose, agent_id, event_id, "error", error=f"connect: {e}"[:300])
                    return GenerateResult("unavailable", None, PROVIDER, self.model, int((time.time() - t0) * 1000), error_code="CONNECT")
                except httpx.TimeoutException:
                    ms = int((time.time() - t0) * 1000)
                    self.ledger.settle(rid, status="unknown", latency_ms=ms, error="timeout (charged at worst case)")
                    self._record(purpose, agent_id, event_id, "timeout", cost=worst, latency_ms=ms, billable=True, error="timeout: worst case recorded")
                    return GenerateResult("timeout", None, PROVIDER, self.model, ms, error_code="TIMEOUT")
                except httpx.HTTPError as e:
                    ms = int((time.time() - t0) * 1000)
                    self.ledger.settle(rid, status="unknown", latency_ms=ms, error=str(e))
                    self._record(purpose, agent_id, event_id, "error", cost=worst, latency_ms=ms, billable=True, error=str(e)[:300])
                    return GenerateResult("failed", None, PROVIDER, self.model, ms, error_code=type(e).__name__)
                try:
                    j = r.json()
                except ValueError:
                    j = {}
                usage = j.get("usage") or {}
                if r.status_code in (429, 502, 503) and not usage and attempt == 0:
                    attempt += 1
                    time.sleep(2.0)
                    continue
                break
        ms = int((time.time() - t0) * 1000)
        if r.status_code != 200:
            err = str((j.get("error") or {}).get("message") or r.text[:200])
            if r.status_code in (401, 402, 403):
                self.ledger.kill(f"provider HTTP {r.status_code}: {err[:120]}")
            st = "settled" if usage else ("released" if r.status_code in (400, 401, 402, 403, 404, 429) else "unknown")
            self.ledger.settle(rid, status=st, actual=float(usage.get("cost") or 0) if usage else None, latency_ms=ms, error=f"HTTP {r.status_code}: {err}")
            self._record(purpose, agent_id, event_id, "error", latency_ms=ms, error=f"HTTP {r.status_code}: {err}"[:400],
                         cost=float(usage.get("cost") or 0) if usage else (worst if st == "unknown" else 0), billable=st != "released")
            return GenerateResult("failed", None, PROVIDER, self.model, ms, error_code=f"HTTP_{r.status_code}")
        tin, tout = int(usage.get("prompt_tokens") or 0), int(usage.get("completion_tokens") or 0)
        cost = usage.get("cost")
        cost = float(cost) if cost is not None else tin * pin + tout * pout
        served = j.get("model") or self.model
        self.ledger.settle(rid, status="settled", actual=cost, tokens_in=tin, tokens_out=tout, latency_ms=ms, request_id=str(j.get("id") or ""))
        text = ""
        try:
            text = j["choices"][0]["message"].get("content") or ""
        except (KeyError, IndexError, TypeError):
            pass
        try:
            out = json.loads(text)
            if not isinstance(out, dict):
                raise ValueError
            status = "ok"
        except ValueError:
            out, status = None, "rejected_output"
        self.meter.record(provider=PROVIDER, model=served, purpose=purpose, agent_id=agent_id, event_id=event_id, tokens_in=tin, tokens_out=tout, cost=cost,
                          latency_ms=ms, status=status, billable=True, request_id=str(j.get("id") or ""))
        _, cutoff, _ = self.caps()
        if self.ledger.committed() >= cutoff:
            self.ledger.kill(f"cutoff ${cutoff:.2f} reached after call")
        return GenerateResult("succeeded" if out is not None else "invalid_output", out, PROVIDER, served, ms, tin, tout, cost, raw_text=text[:4000],
                              error_code=None if out is not None else "JSON_PARSE")

    def health(self) -> dict:
        return {"gate": self.gate(), "model": self.model, "ledger": self.ledger.summary()}
