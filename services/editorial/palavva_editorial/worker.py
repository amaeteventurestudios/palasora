"""Background worker: processes the durable queue (agent city, owner tasks, translation, search) and relays town events.

Single process, one model request in flight. Never busy-loops: sleeps when idle, defers
on Qwen outage or budget exhaustion. Ctrl-C / SIGTERM finish the current step and exit.
"""
from __future__ import annotations

import fcntl
import logging
import os
import signal
import time

from . import analytics_etl, config, search as fts, translate
from .jobs import Queue
from .pb import PB, PBError, q
from .common import Deferred
from .providers import make_provider

log = logging.getLogger("palavva.worker")
STOP = False


def reindex_all(pb: PB, s: config.Settings) -> int:
    pieces = pb.list_all("editorial_pieces", "review_status='published'")
    return fts.reindex(s.search_db, pieces)


NEWS_JOBS = ("fetch_source", "draft_cluster", "converse", "retry_auto_publish")


def process_one(pb: PB, queue: Queue, s: config.Settings, provider, owner: str) -> bool:
    # v1.6: when the writer pool runs (palavva_editorial.city.writers), agent writing jobs belong to it.
    job = queue.claim(owner, exclude=["city_act"] if os.environ.get("WRITER_POOL_ENABLED", "false").lower() == "true" else None)
    if not job:
        return False
    try:
        if job["type"] == "translate":
            queue.complete(job["job_id"], owner, translate.translate_job(pb, queue, s, provider, job))
        elif job["type"] == "city_tick":
            from .city import engine as city
            queue.complete(job["job_id"], owner, city.tick(pb, queue, s, job))
        elif job["type"] == "city_act":
            from .city import engine as city
            queue.complete(job["job_id"], owner, city.act(pb, queue, s, provider, job))
        elif job["type"] == "owner_task":
            from .city import engine as city
            queue.complete(job["job_id"], owner, city.owner_task(pb, queue, s, provider, job))
        elif job["type"] == "reindex_search":
            queue.complete(job["job_id"], owner, {"indexed": reindex_all(pb, s)})
        elif job["type"] in NEWS_JOBS:  # Palasora Phase 5: news is removed; a job queued before the upgrade finishes as skipped
            queue.complete(job["job_id"], owner, {"skipped": "news removed"})
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


def town_relay(pb: PB) -> dict | None:
    """One relay pass when a town exists (TOWN_RELAY_ENABLED, default on; tenant slug PALASORA_TOWN_TENANT, default palavva)."""
    if os.environ.get("TOWN_RELAY_ENABLED", "true").lower() == "false":
        return None
    from .economy import service as economy
    from .economy.town import social
    con = economy.con()
    if not con.execute("SELECT 1 FROM outbox WHERE status='pending' LIMIT 1").fetchone():
        return None
    t = pb.first("tenants", f"slug={q(os.environ.get('PALASORA_TOWN_TENANT', 'palavva'))}")
    if t is None:
        return None
    out = social.relay(con, pb, t["id"])
    if out["delivered"] or out["failed"] or out["held"]:
        log.info("town relay %s", out)
    return out


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
    last_index = last_etl = last_rest = last_city = last_town = 0.0
    from .city import engine as city
    while not STOP:
        now = time.time()
        try:
            if now - last_city > 60:
                # Owner instructions are always picked up (bounded by their own caps); the seed city's bounded
                # evaluation window is only scheduled when CITY_ENABLED=true (one tick per window, idempotent).
                city.poll_owner_tasks(pb, queue)
                if city.cfg()["enabled"]:
                    for t in pb.list_all("tenants", "status='active' && is_demo=false"):
                        city.enqueue_tick(queue, t["id"])
                last_city = now
            if now - last_town > 10:
                town_relay(pb)  # Palasora Phase 4: deliver stored town events to the feed, notifications and live updates
                last_town = now
            if now - last_index > 600:
                reindex_all(pb, s)
                last_index = now
            if now - last_rest > 600:
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
