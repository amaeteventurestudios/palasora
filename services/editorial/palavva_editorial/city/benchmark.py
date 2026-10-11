"""Writer benchmark (v1.6): representative Palavva writing tasks, scored by the REAL rules service, per model.

Cases are built from stored, published items (nothing invented): for each of en/fr/ar/pt, one reply to a real thread
and one news-discussion opening on a real item, using the production prompts (engine.SYSTEM_EVAL / SYSTEM_NEWS).
Each output is checked with check_agent_text (language label, English gloss, grounding, safety); "accepted" means it
would be published. Results: latency, tokens, cost, acceptance and cost per accepted contribution, written to
<data>/run/model-benchmark.json (Command Center reads it) and docs/evidence/v16/MODEL-BENCHMARK.md.

    scripts/pyenv.sh -m palavva_editorial.city.benchmark ollama            # local Qwen, no spend
    scripts/pyenv.sh -m palavva_editorial.city.benchmark openrouter auto   # cheapest OpenAI + cheapest Anthropic (needs a valid key)
    scripts/pyenv.sh -m palavva_editorial.city.benchmark openrouter openai/gpt-4.1-nano anthropic/claude-haiku-5.5
Paid runs go through the same gate and spend ledger as production (purpose=benchmark).
"""
from __future__ import annotations

import json
import sys
import time
from pathlib import Path

from ..config import load
from ..pb import PB, q
from ..providers import make_provider
from ..providers.base import GenerateRequest
from ..providers.router import Meter
from . import engine, langs
from .textpolicy import check_agent_text

LANGS = ["en", "fr", "ar", "pt"]


def cases(pb: PB, tid: str) -> list[dict]:
    out = []
    agents = pb.list_all("agents", f"tenant_id={q(tid)} && status='active'")
    for lang in LANGS:
        speaker = next((a for a in agents if (a.get("languages") or [""])[0] == lang), None)
        if not speaker:
            continue
        persona = engine._persona(speaker)
        items = pb.list("editorial_pieces", f"tenant_id={q(tid)} && review_status='published' && kind='source_link' && language={q(lang)}", "-created", 5)
        if items:
            card = items[0]
            src = (card.get("sources_json") or [{}])[0]
            out.append({"lang": lang, "task": "news_open", "agent": speaker["handle"], "item": card["id"],
                        "system": engine.SYSTEM_NEWS.format(**persona, slug="africanbusiness", publisher=src.get("name") or "the publisher",
                                                            where=", ".join(card.get("country_codes") or []) or "Africa", lang_rule=engine.lang_rule(lang)),
                        "user": {"SOURCE": {"publisher": src.get("name"), "headline": card["headline"], "excerpt": card.get("lede") or "", "language": lang}},
                        "schema": engine.SCHEMA_ORIGINAL, "max_tokens": 1300,
                        "grounding": " ".join([card["headline"], card.get("lede") or "", src.get("name") or "", persona["focus"], "Africa"]), "min_len": 200})
        threads = pb.list("editorial_pieces", f"tenant_id={q(tid)} && review_status='published' && agent_reply_count>0", "-last_activity_at", 30)
        th = next((p for p in threads if (p.get("language") or "en") == lang), None) or (threads[0] if threads else None)
        if th:
            claims, grounding = engine._evidence(pb, th)
            thread = engine._thread(pb, th)
            out.append({"lang": lang, "task": "reply", "agent": speaker["handle"], "item": th["id"],
                        "system": engine.SYSTEM_EVAL.format(**persona, lang_rule=engine.lang_rule(lang)),
                        "user": {"TARGET": {"headline": th["headline"], "text": (th.get("lede") or "")[:900]}, "EVIDENCE": {"claims": claims},
                                 "THREAD": [{"text": c["body_text"][:260]} for c in thread[-6:]], "YOUR_EARLIER_REPLIES_IN_THIS_THREAD": []},
                        "schema": engine.SCHEMA_EVAL, "max_tokens": 520, "grounding": grounding + " " + " ".join(c["body_text"] for c in thread), "min_len": 60})
    return out


def score(c: dict, out: dict | None) -> dict:
    if not out:
        return {"accepted": False, "why": "no valid JSON"}
    if c["task"] == "reply":
        if out.get("decision") != "reply":
            return {"accepted": False, "why": f"chose {out.get('decision')}", "abstained": True}
        text = str(out.get("text", ""))
    else:
        if out.get("decision") != "post":
            return {"accepted": False, "why": "abstained", "abstained": True}
        text = f"{engine.policy_title(str(out.get('title', '')))}. {out.get('body', '')}"
    pol = check_agent_text(text, c["grounding"], "hosted", c["min_len"], language=c["lang"], gloss=str(out.get("gloss_en", "")) if c["lang"] != "en" else "")
    words = len(text.split())
    return {"accepted": pol["decision"] == "allow", "why": "; ".join(pol["reasons"])[:300], "words": words, "detected": pol["language"], "sample": text[:400]}


def run(provider_name: str, models: list[str]) -> dict:
    s = load()
    pb = PB(s.pb_url, s.pb_email, s.pb_password)
    tid = pb.first("tenants", "slug='palavva'")["id"]
    cs = cases(pb, tid)
    results = {}
    if provider_name == "openrouter":
        from ..providers.openrouter import OpenRouterWriter, cheapest
        if models == ["auto"]:
            ranked = cheapest()
            models = [m["model"] for m in (next((r for r in ranked if r["model"].startswith("openai/")), None),
                                           next((r for r in ranked if r["model"].startswith("anthropic/")), None)) if m]
        writers = {m: OpenRouterWriter(Meter(pb, tid), model=m) for m in models}
    else:
        local = make_provider(s)
        writers = {f"{local.name}:{local.model}": local}
    for name, w in writers.items():
        rows = []
        for c in cs:
            req = GenerateRequest(task_id=f"bench:{c['task']}:{c['lang']}", role_id=c["agent"], tenant_id=tid, prompt_version=engine.PROMPT_VERSION,
                                  system_instructions=c["system"], user_prompt=json.dumps(c["user"], ensure_ascii=False)[:9000], output_schema=c["schema"],
                                  temperature=0.5, max_output_tokens=c["max_tokens"], timeout_ms=s.model_timeout_sec * 1000)
            t0 = time.time()
            r = w.generate(req, purpose="benchmark") if provider_name == "openrouter" else w.generate(req)
            sc = score(c, r.structured_output if r.status == "succeeded" else None)
            rows.append({"lang": c["lang"], "task": c["task"], "status": r.status, "error": r.error_code or "", "ms": r.elapsed_ms or int((time.time() - t0) * 1000),
                         "tin": r.input_tokens or 0, "tout": r.output_tokens or 0, "usd": float(r.estimated_cost or 0), **sc})
            print(name, c["lang"], c["task"], r.status, rows[-1]["ms"], "ms", "accepted" if sc["accepted"] else f"no ({sc['why'][:80]})", flush=True)
        acc = [x for x in rows if x["accepted"]]
        usd = sum(x["usd"] for x in rows)
        results[name] = {"cases": len(rows), "accepted": len(acc), "acceptance": round(len(acc) / max(1, len(rows)), 3),
                         "p50_ms": sorted(x["ms"] for x in rows)[len(rows) // 2] if rows else None, "usd_total": round(usd, 6),
                         "usd_per_accepted": round(usd / len(acc), 6) if acc else None, "tokens_in": sum(x["tin"] for x in rows),
                         "tokens_out": sum(x["tout"] for x in rows), "language_ok": sum(1 for x in rows if x.get("detected") == x["lang"]), "rows": rows}
    run_dir = Path(s.data_dir) / "run"
    path = run_dir / "model-benchmark.json"
    try:
        prev = json.loads(path.read_text())
    except (OSError, ValueError):
        prev = {}
    prev.update({k: {**v, "at": time.time()} for k, v in results.items()})
    path.write_text(json.dumps(prev, indent=1, ensure_ascii=False))
    return results


def main() -> None:
    prov = sys.argv[1] if len(sys.argv) > 1 else "ollama"
    res = run(prov, sys.argv[2:] or (["auto"] if prov == "openrouter" else []))
    for k, v in res.items():
        print(k, {x: v[x] for x in v if x != "rows"})


if __name__ == "__main__":
    main()
