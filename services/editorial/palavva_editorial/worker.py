"""Background worker: schedules due source fetches and processes the durable queue.

Single process, one model request in flight. Never busy-loops: sleeps when idle, defers
on Qwen outage or budget exhaustion. Ctrl-C / SIGTERM finish the current step and exit.
"""
from __future__ import annotations

import fcntl
import logging
import os
import signal
import time
from datetime import datetime, timezone

from . import analytics_etl, config, conversation, search as fts, translate
from .jobs import Queue
from .pb import PB, PBError, q
from .pipeline import Deferred, draft_cluster, ingest_source, pbdate
from .providers import make_provider

log = logging.getLogger("palavva.worker")
STOP = False


def reindex_all(pb: PB, s: config.Settings) -> int:
    pieces = pb.list_all("editorial_pieces", "review_status='published'")
    return fts.reindex(s.search_db, pieces)


def schedule_due_sources(pb: PB, queue: Queue) -> int:
    now = datetime.now(timezone.utc)
    n = 0
    for src in pb.list_all("sources", "enabled=true && rights_status='approved'"):
        due = src.get("next_fetch_at") or ""
        if due and due > pbdate(now):
            continue
        bucket = int(time.time() // (60 * max(15, int(src.get("fetch_interval_minutes") or 60))))
        _, created = queue.enqueue(src["tenant_id"], "fetch_source", {"source_id": src["id"]}, f"sched:{src['id']}:{bucket}")
        n += int(created)
    return n


def process_one(pb: PB, queue: Queue, s: config.Settings, provider, owner: str) -> bool:
    job = queue.claim(owner)
    if not job:
        return False
    try:
        if job["type"] == "fetch_source":
            src = pb.get("sources", job["payload"]["source_id"])
            if src["tenant_id"] != job["tenant_id"]:
                raise ValueError("tenant mismatch")
            res = ingest_source(pb, queue, s, src)
            queue.complete(job["job_id"], owner, dict(res))
        elif job["type"] == "draft_cluster":
            res = draft_cluster(pb, queue, s, provider, job)
            queue.complete(job["job_id"], owner, res)
        elif job["type"] == "converse":
            res = conversation.converse_step(pb, queue, s, provider, job)
            queue.complete(job["job_id"], owner, res)
        elif job["type"] == "retry_auto_publish":
            queue.complete(job["job_id"], owner, conversation.retry_auto_publish(pb, queue, s, job))
        elif job["type"] == "translate":
            queue.complete(job["job_id"], owner, translate.translate_job(pb, queue, s, provider, job))
        elif job["type"] == "reindex_search":
            queue.complete(job["job_id"], owner, {"indexed": reindex_all(pb, s)})
        else:
            queue.fail(job["job_id"], owner, "UNKNOWN_TYPE", job["type"], retryable=False)
    except Deferred as d:
        log.info("deferred %s %s: %s", job["type"], job["job_id"], d.reason)
        queue.defer(job["job_id"], owner, d.seconds, d.reason)
    except PBError as e:
        log.warning("pb error %s: %s", job["job_id"], e)
        queue.fail(job["job_id"], owner, f"PB_{e.status}", str(e))
    except Exception as e:  # noqa: BLE001 - poison jobs go to dead letters after max attempts
        log.exception("job failed %s", job["job_id"])
        queue.fail(job["job_id"], owner, type(e).__name__, str(e))
    return True


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
    logging.getLogger("httpx").setLevel(logging.WARNING)
    s = config.load()
    pb = PB(s.pb_url, s.pb_email, s.pb_password)
    queue = Queue(s.jobs_db, lease_seconds=900)
    provider = make_provider(s)
    owner = f"worker-{os.getpid()}"
    # Single-worker guarantee: model concurrency 1 must hold across processes, not just threads.
    lock = open(s.data_dir / "run" / "worker.lock", "w")
    try:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        log.error("another worker holds %s; exiting", lock.name)
        return
    lock.write(str(os.getpid()))
    lock.flush()

    def stop(*_):
        global STOP
        STOP = True
    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)
    log.info("worker started provider=%s model=%s", provider.name, provider.model)
    last_sched = last_index = last_etl = last_rest = 0.0
    while not STOP:
        now = time.time()
        try:
            if now - last_sched > 60:
                schedule_due_sources(pb, queue)
                last_sched = now
            if now - last_index > 600:
                reindex_all(pb, s)
                last_index = now
            if now - last_rest > 600:
                conversation.rest_idle_threads(pb, queue)
                translate.retry_outdated_failures(pb, queue)
                translate.revalidate_outdated(pb, queue)
                last_rest = now
            if now - last_etl > 3600:
                analytics_etl.run(s, pb)
                last_etl = now
            if not process_one(pb, queue, s, provider, owner):
                time.sleep(5)
        except Exception:  # noqa: BLE001 - PocketBase down etc.: back off, never spin
            log.exception("worker loop error")
            time.sleep(15)
    log.info("worker stopped")


if __name__ == "__main__":
    main()
