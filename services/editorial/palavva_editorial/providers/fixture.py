"""Deterministic FIXTURE provider. For hermetic tests and demos only.

Its output is labeled is_fixture_provider=true in ai_runs and is never evidence that real
Qwen works (T-019 requires a real Ollama response).
"""
from __future__ import annotations

import hashlib
import json
import re

from .base import GenerateRequest, GenerateResult


class FixtureProvider:
    name = "fixture"
    model = "deterministic-fixture-v1"

    def __init__(self, mode: str = "ok"):
        self.mode = mode  # ok | offline | invalid | bad_citation | abstain

    def health(self) -> dict:
        return {"reachable": self.mode != "offline", "model_present": True, "latency_ms": 0, "fixture": True}

    def generate(self, req: GenerateRequest) -> GenerateResult:
        if self.mode == "offline":
            return GenerateResult("unavailable", None, self.name, self.model, 0, error_code="UNREACHABLE:fixture")
        if self.mode == "invalid":
            return GenerateResult("invalid_output", None, self.name, self.model, 0, error_code="JSON_PARSE", retries=1)
        packet = re.search(r"EVIDENCE_PACKET_JSON:\n(.*)\nEND_EVIDENCE", req.user_prompt, re.S)
        ev = json.loads(packet.group(1)) if packet else {"sources": [], "claims": []}
        ids = [c["claim_id"] for c in ev.get("claims", [])] or ["claim_1"]
        src = ev.get("sources", [{}])[0] if ev.get("sources") else {}
        h = hashlib.sha256(req.user_prompt.encode()).hexdigest()[:6]
        stage = req.prompt_version.split("-")[0]
        if self.mode == "abstain":
            out = {"decision": "ABSTAIN", "reason": "fixture abstain"}
        elif stage == "curator":
            out = {"decision": "SHORT", "scores": {"evidence": 2, "novelty": 2, "relevance": 3, "constructive_interest": 2}, "reasons": ["fixture"], "risk_category": "low", "additional_evidence_needed": []}
        elif stage == "researcher":
            src_id = src.get("source_id", "S1")
            out = {"decision": "CLAIMS", "claims": [{"claim_id": "claim_1", "text": f"{src.get('publisher', 'The source')} reported: {src.get('title', '')}".strip(),
                   "kind": "observation", "source_ids": [src_id], "uncertainty": "Based on the headline and permitted excerpt only."}], "unknowns": ["Details beyond the publisher's headline."]}
        elif stage == "writer":
            cited = ids[:1] if self.mode != "bad_citation" else ["claim_999"]
            out = {"decision": "DRAFT", "headline": f"[Fixture {h}] What does this report mean?", "what_happened": [{"text": "Fixture summary of the cited report.", "claim_ids": cited}],
                   "why_it_matters": [{"text": "Fixture explanation of relevance.", "claim_ids": cited}], "unknowns": ["Fixture unknown."], "questions": ["Fixture question?"], "risk_flags": [], "confidence_note": "fixture"}
        elif stage == "role":
            out = {"decision": "CONTRIBUTE", "text": "Fixture role contribution that adds one distinct, cited point.", "claim_ids": ids[:1]}
        elif stage == "validator":
            out = {"verdict": "PASS", "flags": []}
        elif stage == "timelens":
            out = {"status": "NO_VERIFIED_COMPARISON"}
        else:
            out = {"decision": "ABSTAIN"}
        return GenerateResult("succeeded", out, self.name, self.model, 1, 100, 60, 0.0, raw_text=json.dumps(out))
