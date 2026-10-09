"""Server-side event writer (same format and allowlist as apps/web/lib/analytics-server.ts)."""
from __future__ import annotations

import json
import re
import uuid
from datetime import datetime, timezone

from .config import Settings

SERVER_EVENTS = {"ai_generation_completed", "source_fetch_failed", "story_published", "correction_published"}
SAFE = re.compile(r"^[A-Za-z0-9_.:-]{0,64}$")


def write(settings: Settings, tenant_id: str, event: str, **fields: str) -> bool:
    if event not in SERVER_EVENTS or not re.fullmatch(r"[a-z0-9]{10,20}", tenant_id):
        return False
    now = datetime.now(timezone.utc)
    ev = {"event_id": str(uuid.uuid4()), "event_name": event, "occurred_at": now.isoformat().replace("+00:00", "Z"), "tenant_id": tenant_id,
          "server_received_at": now.isoformat().replace("+00:00", "Z")}
    ev.update({k: v for k, v in fields.items() if isinstance(v, str) and SAFE.match(v)})
    d = settings.analytics_dir / f"tenant={tenant_id}" / f"date={now:%Y-%m-%d}"
    try:
        d.mkdir(parents=True, exist_ok=True)
        with open(d / f"events-{now:%H}.ndjson", "a") as f:
            f.write(json.dumps(ev) + "\n")
        return True
    except OSError:
        return False
