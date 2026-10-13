"""Spins up an isolated PocketBase (temp dir, port 8291) for integration tests."""
from __future__ import annotations

import os
import subprocess
import time
from pathlib import Path

import httpx
import pytest

os.environ.setdefault("SWITCH_CACHE_SECONDS", "0")  # tests flip switches and read them back at once (switch_cache)

ROOT = Path(__file__).resolve().parents[3]
PB_BIN = ROOT / "services/pocketbase/bin/pocketbase"
PORT = 8291


@pytest.fixture(scope="session")
def pb_server(tmp_path_factory):
    data = tmp_path_factory.mktemp("pb_data")
    mig, hooks = ROOT / "services/pocketbase/pb_migrations", ROOT / "services/pocketbase/pb_hooks"
    subprocess.run([str(PB_BIN), "migrate", "up", f"--dir={data}", f"--migrationsDir={mig}"], check=True, capture_output=True)
    subprocess.run([str(PB_BIN), "superuser", "upsert", "svc@test.local", "test-password-123", f"--dir={data}"], check=True, capture_output=True)
    proc = subprocess.Popen([str(PB_BIN), "serve", f"--dir={data}", f"--migrationsDir={mig}", f"--hooksDir={hooks}", f"--http=127.0.0.1:{PORT}"],
                            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    url = f"http://127.0.0.1:{PORT}"
    for _ in range(60):
        try:
            if httpx.get(f"{url}/api/health", timeout=1).status_code == 200:
                break
        except httpx.HTTPError:
            time.sleep(0.2)
    env = {"PB_URL": url, "PB_SERVICE_EMAIL": "svc@test.local", "PB_SERVICE_PASSWORD": "test-password-123", "PB_WORKER_EMAIL": "svc@test.local",
           "PB_WORKER_PASSWORD": "test-password-123", "LOCAL_DEMO_PASSWORD": "test-demo-password-1", "PALAVVA_DATA_DIR": str(tmp_path_factory.mktemp("data")),
           "TENANT_HOSTS": '{"a.test:3000":"palavva","b.test:3000":"sample-community"}', "MODEL_PROVIDER": "fixture", "EDITORIAL_SERVICE_TOKEN": "t", "AUTO_PUBLISH_DISABLED": "false"}
    old = {k: os.environ.get(k) for k in env}
    os.environ.update(env)
    yield {"url": url, "data": data}
    proc.terminate()
    proc.wait(10)
    for k, v in old.items():
        if v is None:
            os.environ.pop(k, None)
        else:
            os.environ[k] = v


@pytest.fixture(scope="session")
def seeded(pb_server):
    from palavva_editorial import seed
    assert seed.main() == 0
    from palavva_editorial.pb import PB
    pb = PB(pb_server["url"], "svc@test.local", "test-password-123")
    t = {r["slug"]: r for r in pb.list("tenants")}
    return {"pb": pb, "palavva": t["palavva"], "sample": t["sample-community"]}
