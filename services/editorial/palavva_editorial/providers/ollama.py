"""Ollama adapter for qwen3.5:4b on Simeon's iMac over private Tailscale.

The endpoint comes from server env only (never client-configurable). One request in flight,
bounded timeout, JSON-schema constrained output, one shorter retry on format failure.
No fallback to any paid provider.
"""
from __future__ import annotations

import fcntl
import json
import os
import time
from pathlib import Path

import httpx

from .base import GenerateRequest, GenerateResult, semaphore


def _host_lock(wait: float):
    p = Path(os.environ.get("PALAVVA_DATA_DIR", "./data")).resolve() / "run" / "ollama.lock"
    p.parent.mkdir(parents=True, exist_ok=True)
    f = open(p, "w")
    end = time.time() + wait
    while True:
        try:
            fcntl.flock(f, fcntl.LOCK_EX | fcntl.LOCK_NB)
            return f
        except BlockingIOError:
            if time.time() > end:
                f.close()
                return None
            time.sleep(0.2)


class OllamaProvider:
    name = "ollama"

    def __init__(self, url: str, model: str, max_concurrency: int = 1, timeout_sec: int = 90):
        self.url = url.rstrip("/")
        self.model = model
        self.sem = semaphore(max_concurrency)
        self.timeout = timeout_sec

    def health(self) -> dict:
        t0 = time.time()
        try:
            r = httpx.get(f"{self.url}/api/tags", timeout=5)
            models = [m.get("name") for m in r.json().get("models", [])] if r.status_code == 200 else []
            return {"reachable": r.status_code == 200, "model_present": self.model in models, "latency_ms": int((time.time() - t0) * 1000)}
        except (httpx.HTTPError, ValueError) as e:
            return {"reachable": False, "model_present": False, "error": type(e).__name__, "latency_ms": int((time.time() - t0) * 1000)}

    def _call(self, req: GenerateRequest, max_tokens: int) -> tuple[httpx.Response | None, str | None, int]:
        body = {
            "model": self.model, "stream": False, "think": False, "format": req.output_schema,
            "messages": [{"role": "system", "content": req.system_instructions}, {"role": "user", "content": req.user_prompt}],
            "options": {"temperature": req.temperature, "num_predict": max_tokens},
        }
        t0 = time.time()
        acquired = self.sem.acquire(timeout=self.timeout)
        if not acquired:
            return None, "CONCURRENCY_TIMEOUT", int((time.time() - t0) * 1000)
        lock = None
        try:
            # v1.6: one request in flight on the shared Qwen host ACROSS processes (worker + writer pool), not just threads.
            lock = _host_lock(self.timeout)
            if lock is None:
                return None, "CONCURRENCY_TIMEOUT", int((time.time() - t0) * 1000)
            r = httpx.post(f"{self.url}/api/chat", json=body, timeout=httpx.Timeout(min(self.timeout, req.timeout_ms / 1000), connect=8))
            return r, None, int((time.time() - t0) * 1000)
        except httpx.TimeoutException:
            return None, "TIMEOUT", int((time.time() - t0) * 1000)
        except httpx.HTTPError as e:
            return None, f"UNREACHABLE:{type(e).__name__}", int((time.time() - t0) * 1000)
        finally:
            if lock is not None:
                fcntl.flock(lock, fcntl.LOCK_UN)
                lock.close()
            self.sem.release()

    def generate(self, req: GenerateRequest) -> GenerateResult:
        retries = 0
        max_tokens = req.max_output_tokens
        total_ms = 0
        while True:
            r, err, ms = self._call(req, max_tokens)
            total_ms += ms
            if err:
                status = "timeout" if err == "TIMEOUT" else "unavailable"
                return GenerateResult(status, None, self.name, self.model, total_ms, error_code=err, retries=retries)
            if r.status_code != 200:
                return GenerateResult("failed", None, self.name, self.model, total_ms, error_code=f"HTTP_{r.status_code}", retries=retries)
            j = r.json()
            text = (j.get("message") or {}).get("content", "")
            try:
                out = json.loads(text)
                if not isinstance(out, dict):
                    raise ValueError("not an object")
                return GenerateResult("succeeded", out, self.name, self.model, total_ms, j.get("prompt_eval_count"), j.get("eval_count"),
                                      0.0, retries=retries, raw_text=text[:4000])
            except ValueError:
                if retries >= 1:
                    return GenerateResult("invalid_output", None, self.name, self.model, total_ms, j.get("prompt_eval_count"), j.get("eval_count"),
                                          error_code="JSON_PARSE", retries=retries, raw_text=text[:2000])
                retries += 1
                max_tokens = max(200, max_tokens // 2)  # one shorter retry, then hold
