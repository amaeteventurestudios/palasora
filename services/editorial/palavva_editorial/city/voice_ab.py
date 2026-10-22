"""v1.8+ ISSUE-02 controlled A/B: the v1.7 brief versus the v1.8 voice, on the SAME residents and the SAME real targets.

Nothing is published. For N eligible residents (spread across countries, deterministic sample), one real published
thread each is chosen in a language the resident reads; the reply is written twice with the production writer model:
once with the verbatim v1.7 prompt, once with the v1.8 voice (own DNA, length shape, memory blocks). Each output goes
through the real validator (check_agent_text) and, for v1.8, the shape length check. Paid calls use the same metered
router, spend ledger and caps as production (purpose=benchmark); the run stops at --max-usd.

    scripts/pyenv.sh -m palavva_editorial.city.voice_ab 60 0.20      # 60 residents, stop at $0.20
Writes docs/evidence/v18-plus/VOICE-AB.json and VOICE-AB.md.
"""
from __future__ import annotations

import json
import re
import statistics as st
import sys
import time
from collections import Counter
from pathlib import Path

from ..config import load
from ..editorial import diversity
from ..textsim import jaccard, title_fingerprint
from ..pb import PB, q
from ..providers.base import GenerateRequest
from ..providers.router import Meter
from . import engine, langs, memory_blocks, voice
from .textpolicy import check_agent_text

EMOJI = re.compile(r"[\U0001F300-\U0001FAFF☀-➿]")
ROOT = Path(__file__).resolve().parents[4]


def pick_residents(pb: PB, tid: str, n: int) -> list[dict]:
    rows = pb.list_all("agents", f"tenant_id={q(tid)} && kind='palavva_ai' && status='active' && adm1_code!=''")
    by_cc: dict[str, list[dict]] = {}
    for a in sorted(rows, key=lambda a: a["id"]):
        by_cc.setdefault(a.get("edition") or "", []).append(a)
    out, i = [], 0
    while len(out) < n and any(by_cc.values()):  # round-robin across countries
        for cc in sorted(by_cc):
            if by_cc[cc] and len(out) < n:
                out.append(by_cc[cc].pop(0))
        i += 1
    return out


def pick_target(pb: PB, tid: str, agent: dict, used: set[str]) -> dict | None:
    cc = agent.get("edition") or ""
    flt = f"tenant_id={q(tid)} && review_status='published' && kind='agent_post' && author_agent_id!={q(agent['id'])}"
    for f in ([f"{flt} && country_codes~{q(chr(34) + cc + chr(34))}"] if cc else []) + [flt]:
        for p in pb.list("editorial_pieces", f, "-last_activity_at", 40):
            if p["id"] in used or not langs.reads(agent, p.get("language") or "en"):
                continue
            used.add(p["id"])
            return p
    return None


def build(pb: PB, agent: dict, piece: dict) -> dict:
    claims, grounding = engine._evidence(pb, piece)
    thread = engine._thread(pb, piece)
    names: dict = {}
    body = piece.get("body_blocks_json") or {}
    target = {"type": "agent post", "headline": piece.get("headline"), "text": ((body.get("post_body") if isinstance(body, dict) else "") or piece.get("lede", ""))[:900],
              "author": "topic starter"}
    lang = langs.for_reply(agent, piece.get("language") or "en")
    base_user = {"YOUR_EARLIER_REPLIES_IN_THIS_THREAD": [], "TARGET": target,
                 "EVIDENCE": {"claims": claims, "sources": [s_.get("name") for s_ in (piece.get("sources_json") or [])][:3]},
                 "THREAD": [{"author": engine._author_label(pb, c, names), "text": c["body_text"][:260]} for c in thread[-8:]],
                 "ANGLES_ALREADY_COVERED": [c.get("new_angle") for c in thread if c.get("new_angle")][:8],
                 "YOUR_RECENT_ANGLES": (agent.get("memory") or {}).get("angles", [])[-5:]}
    persona = engine._persona(agent)
    shape = voice.reply_shape(agent, piece["id"], depth=sum(1 for c in thread if c.get("parent_id")))
    d = voice.dna(agent)
    line = f"{agent['handle']}: {d['temperament']}, {voice.CADENCES[d['cadence']]}, debate: {voice.DEBATE[d['debate']]}; focus {persona['focus']}"
    thread_text = " ".join(c["body_text"] + " " + str((c.get("provenance") or {}).get("gloss_en") or "") for c in thread)
    return {"agent": agent, "piece": piece, "lang": lang, "grounding": grounding + " " + thread_text, "shape": shape, "dna": d, "thread": thread,
            "v17": {"system": engine.SYSTEM_EVAL_V17.format(**persona, lang_rule=engine.lang_rule(lang)), "user": base_user, "min_len": 60},
            "v18": {"system": engine.SYSTEM_EVAL.format(**persona, lang_rule=engine.lang_rule(lang), voice=voice.style_brief(agent, shape, piece["id"])),
                    "user": {"MEMORY": memory_blocks.render(agent, line, thread_id=piece["id"]), **base_user}, "min_len": voice.min_chars(shape)}}


def score(case: dict, arm: str, out: dict | None) -> dict:
    if not out:
        return {"accepted": False, "why": "no valid JSON"}
    if out.get("decision") != "reply":
        return {"accepted": False, "why": f"chose {out.get('decision')}", "abstained": True}
    text = str(out.get("text", "")).strip()
    pol = check_agent_text(text, case["grounding"], "hosted", case[arm]["min_len"], language=case["lang"], gloss=str(out.get("gloss_en", "")) if case["lang"] != "en" else "")
    reasons = list(pol["reasons"])
    if arm == "v18":
        fits, note = voice.length_ok(text, case["shape"])
        if not fits:
            reasons.append(f"length: {note}")
    copied = engine._shared_run(text, [c["body_text"] for c in case["thread"]])
    if copied >= 8:
        reasons.append(f"novelty: copies {copied} words")
    return {"accepted": pol["decision"] == "allow" and not reasons, "held": pol["decision"] == "hold", "why": "; ".join(reasons)[:300], "text": text,
            "words": len(text.split()), "emoji": bool(EMOJI.search(text)), "question": text.endswith("?") or text.endswith("؟"),
            "opener": " ".join(text.split()[:3]).lower(), "stance": out.get("stance", "")}


def summary(rows: list[dict]) -> dict:
    acc = [r for r in rows if r.get("accepted")]
    words = [r["words"] for r in rows if "words" in r]
    replies = [r for r in rows if "words" in r]
    texts = [r["text"] for r in replies]
    fps = [title_fingerprint(t) for t in texts]
    sims = [jaccard(fps[i], fps[j]) for i in range(len(fps)) for j in range(i + 1, len(fps))]
    usd = sum(r.get("usd", 0) for r in rows)
    bands = {"2-12": sum(w <= 12 for w in words), "13-45": sum(13 <= w <= 45 for w in words), "46-80": sum(46 <= w <= 80 for w in words), ">80": sum(w > 80 for w in words)}
    return {"cases": len(rows), "replied": len(replies), "abstained": sum(1 for r in rows if r.get("abstained")), "accepted": len(acc),
            "acceptance": round(len(acc) / max(1, len(rows)), 3), "median_words": st.median(words) if words else None,
            "p10_words": sorted(words)[len(words) // 10] if words else None, "p90_words": sorted(words)[9 * len(words) // 10] if words else None,
            "pct_le_45": round(100 * sum(w <= 45 for w in words) / max(1, len(words)), 1), "bands": bands,
            "emoji_pct": round(100 * sum(r["emoji"] for r in replies) / max(1, len(replies)), 1),
            "question_pct": round(100 * sum(r["question"] for r in replies) / max(1, len(replies)), 1),
            "distinct_openers_pct": round(100 * len({r["opener"] for r in replies}) / max(1, len(replies)), 1),
            "mean_pairwise_similarity": round(st.mean(sims), 3) if sims else None,
            "cross_similarity_max": round(max((diversity.cross_thread_similarity(t, [{"body_text": u} for u in texts if u != t])[0] for t in texts), default=0), 3),
            "usd_total": round(usd, 6), "usd_per_accepted": round(usd / len(acc), 6) if acc else None,
            "p50_ms": sorted(r["ms"] for r in rows)[len(rows) // 2] if rows else None, "tokens_in": sum(r.get("tin", 0) for r in rows),
            "tokens_out": sum(r.get("tout", 0) for r in rows),
            "rejections": Counter(r["why"].split(":")[0] for r in rows if not r.get("accepted") and r.get("why")).most_common(8)}


def run(n: int, max_usd: float, model: str | None = None, arms: tuple[str, ...] = ("v17", "v18"), out_name: str = "VOICE-AB.json") -> dict:
    from ..providers.openrouter import OpenRouterWriter
    s = load()
    pb = PB(s.pb_url, s.pb_email, s.pb_password)
    tid = pb.first("tenants", "slug='palavva'")["id"]
    writer = OpenRouterWriter(Meter(pb, tid), model=model)
    used: set[str] = set()
    cases = []
    for a in pick_residents(pb, tid, n):
        p = pick_target(pb, tid, a, used)
        if p:
            cases.append(build(pb, a, p))
    rows: dict[str, list[dict]] = {"v17": [], "v18": []}
    spent = 0.0
    for i, c in enumerate(cases):
        for arm in arms:
            if spent >= max_usd:
                break
            req = GenerateRequest(task_id=f"voice-ab:{arm}:{c['agent']['id']}:{c['piece']['id']}", role_id=c["agent"]["handle"], tenant_id=tid,
                                  prompt_version=engine.PROMPT_VERSION if arm == "v18" else "city-agent-v4", system_instructions=c[arm]["system"],
                                  user_prompt=json.dumps(c[arm]["user"], ensure_ascii=False)[:9000], output_schema=engine.SCHEMA_EVAL, temperature=0.5,
                                  max_output_tokens=520, timeout_ms=s.model_timeout_sec * 1000)
            t0 = time.time()
            r = writer.generate(req, purpose="benchmark")
            usd = float(r.estimated_cost or 0)
            spent += usd
            sc = score(c, arm, r.structured_output if r.status == "succeeded" else None)
            rows[arm].append({"agent": c["agent"]["handle"], "country": c["agent"].get("edition"), "lang": c["lang"], "shape": c["shape"]["kind"] if arm == "v18" else "v1.7",
                              "temperament": c["dna"]["temperament"], "status": r.status, "ms": r.elapsed_ms or int((time.time() - t0) * 1000),
                              "tin": r.input_tokens or 0, "tout": r.output_tokens or 0, "usd": usd, **sc})
            print(i, arm, c["lang"], rows[arm][-1]["shape"], r.status, sc.get("words"), "ok" if sc["accepted"] else f"no ({sc['why'][:60]})", flush=True)
        if spent >= max_usd:
            print(f"stopped: spend ${spent:.4f} reached the run limit ${max_usd}", flush=True)
            break
    res = {"at": time.time(), "model": writer.model, "residents": len(cases), "countries": len({c["agent"].get("edition") for c in cases}),
           "languages": dict(Counter(c["lang"] for c in cases)), "spent_usd": round(spent, 6),
           **{arm: summary(rows[arm]) for arm in arms}, "rows": rows}
    out = ROOT / "docs" / "evidence" / "v18-plus"
    (out / out_name).write_text(json.dumps(res, indent=1, ensure_ascii=False))
    return res


def main() -> None:
    n = int(sys.argv[1]) if len(sys.argv) > 1 else 60
    cap = float(sys.argv[2]) if len(sys.argv) > 2 else 0.20
    model = sys.argv[3] if len(sys.argv) > 3 else None
    arms = tuple(sys.argv[4].split(",")) if len(sys.argv) > 4 else ("v17", "v18")
    res = run(n, cap, model, arms, f"VOICE-AB-{model.replace('/', '_')}.json" if model else "VOICE-AB.json")
    for arm in arms:
        print(arm, json.dumps({k: v for k, v in res[arm].items()}, ensure_ascii=False))


if __name__ == "__main__":
    main()
