"""Shared writer pool (v1.6): one process, N threads, claiming `city_act` jobs from the same durable queue.

1,000 agent identities never mean 1,000 model processes. Every writing opportunity the fast engine or the city tick
creates is a queued `city_act` job (idempotent per agent x target); this pool turns jobs into text with whatever the
configured route allows:

  - WRITER_ROUTE=openrouter,ollama : the paid OpenRouter writer while its gate passes (key, denylist, budget row,
    ledger cutoff, provider reconciliation), local Qwen otherwise. Pool size = OPENROUTER_MAX_CONCURRENCY.
  - WRITER_ROUTE=ollama            : local Qwen only; one request in flight on the host (cross-process lock).

A probe thread re-checks the paid gate every 60 s and publishes the pool's state to `<data>/run/writers.json`
(Command Center reads it). Stopping the process (SIGTERM) finishes in-flight jobs and exits; unfinished leases return
to the queue. Run with WRITER_POOL_ENABLED=true so the general worker leaves `city_act` to this pool.
"""
from __future__ import annotations

import json
import logging
import os
import signal
import threading
import time
from pathlib import Path

import httpx

from ..config import load
from ..jobs import Queue
from ..pb import PB, PBError
from ..providers import make_provider
from ..providers.router import Meter, route, shared_openrouter
from . import engine

log = logging.getLogger("palavva.writers")
STOP = threading.Event()
STATS = {"started_at": time.time(), "done": 0, "deferred": 0, "failed": 0, "by_outcome": {}, "threads": 0, "paid_gate": "", "route": []}
LOCK = threading.Lock()


def _bump(key: str, outcome: str = "") -> None:
    with LOCK:
        STATS[key] += 1
        if outcome:
            STATS["by_outcome"][outcome] = STATS["by_outcome"].get(outcome, 0) + 1


def work(n: int, s, queue: Queue) -> None:
    from ..pipeline import Deferred
    pb = PB(s.pb_url, s.pb_email, s.pb_password)
    provider = make_provider(s)
    owner = f"writer-{os.getpid()}-{n}"
    while not STOP.is_set():
        if n > 0 and not engine.paid_route():  # local Qwen serves one request at a time: extra threads idle until paid writing is open
            STOP.wait(5)
            continue
        job = queue.claim(owner, types=["city_act"])
        if not job:
            STOP.wait(1.0)
            continue
        try:
            res = engine.act(pb, queue, s, provider, job)
            queue.complete(job["job_id"], owner, res)
            _bump("done", str(res.get("outcome")))
        except Deferred as d:
            queue.defer(job["job_id"], owner, d.seconds, d.reason)
            _bump("deferred")
        except PBError as e:
            queue.fail(job["job_id"], owner, f"PB_{e.status}", str(e))
            _bump("failed")
        except (httpx.ConnectError, httpx.RemoteProtocolError) as e:  # PocketBase or a peer restarting: not the job's fault
            queue.defer(job["job_id"], owner, 60, f"SERVICE_UNAVAILABLE: {type(e).__name__}")
            _bump("deferred")
        except Exception as e:  # noqa: BLE001 - poison jobs go to dead letters after max attempts
            log.exception("writer job failed %s", job["job_id"])
            queue.fail(job["job_id"], owner, type(e).__name__, str(e))
            _bump("failed")


def reload_key() -> None:
    """Re-read ONLY OPENROUTER_API_KEY from the git-ignored env file, so a newly generated key is picked up without a
    restart. The value is never logged; the denylist and every budget gate still apply."""
    path = os.environ.get("PALAVVA_ENV_FILE") or str(Path(__file__).resolve().parents[4] / ".env.local")
    try:
        for line in Path(path).read_text().splitlines():
            if line.startswith("OPENROUTER_API_KEY="):
                v = line.split("=", 1)[1].strip().strip('"').strip("'")
                if v != os.environ.get("OPENROUTER_API_KEY", ""):
                    os.environ["OPENROUTER_API_KEY"] = v
                    log.info("OpenRouter key changed in the env file (%s); re-validating", "set" if v else "cleared")
    except OSError:
        pass


def probe(s, tid: str) -> None:
    pb = PB(s.pb_url, s.pb_email, s.pb_password)
    path = s.data_dir / "run" / "writers.json"
    while not STOP.is_set():
        reload_key()
        why = "not in WRITER_ROUTE"
        ledger = {}
        if "openrouter" in route().providers:
            w = shared_openrouter(Meter(pb, tid))
            try:
                why = w.gate()
            except Exception as e:  # noqa: BLE001 - probe failure blocks paid calls (fail closed)
                why = f"probe error: {type(e).__name__}"
            engine.note_paid_gate(w, why == "")
            ledger = w.ledger.summary()
        with LOCK:
            STATS["paid_gate"] = why or "open"
            STATS["route"] = route().providers
            snap = {**STATS, "ledger": ledger, "updated_at": time.time(), "pid": os.getpid()}
        try:
            path.write_text(json.dumps(snap, default=str))
        except OSError:
            pass
        STOP.wait(60)


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
    logging.getLogger("httpx").setLevel(logging.WARNING)
    s = load()
    pb = PB(s.pb_url, s.pb_email, s.pb_password)
    tid = pb.first("tenants", "slug='palavva'")["id"]
    queue = Queue(s.jobs_db, lease_seconds=600)
    signal.signal(signal.SIGTERM, lambda *_: STOP.set())
    signal.signal(signal.SIGINT, lambda *_: STOP.set())
    threading.Thread(target=probe, args=(s, tid), daemon=True, name="probe").start()
    time.sleep(2)  # first gate probe before sizing the pool
    paid = "openrouter" in route().providers
    n = max(1, int(os.environ.get("WRITER_POOL_SIZE", os.environ.get("OPENROUTER_MAX_CONCURRENCY", "6") if paid else "1")))
    with LOCK:
        STATS["threads"] = n
    log.info("writer pool started: %d threads, route=%s", n, route().providers)
    threads = [threading.Thread(target=work, args=(i, s, queue), name=f"w{i}") for i in range(n)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    log.info("writer pool stopped: %s", {k: v for k, v in STATS.items() if k != "by_outcome"})


if __name__ == "__main__":
    main()
