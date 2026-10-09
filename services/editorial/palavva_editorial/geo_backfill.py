"""Backfill evidence-aware geography for existing pieces (idempotent). Usage: python -m palavva_editorial.geo_backfill"""
from __future__ import annotations

from . import config
from .pb import PB, q
from .pipeline import attach_geo


def main() -> None:
    s = config.load()
    pb = PB(s.pb_url, s.pb_email, s.pb_password)
    for p in pb.list_all("editorial_pieces", "cluster_id != ''"):
        links = pb.list("cluster_sources", f"tenant_id={q(p['tenant_id'])} && cluster_id={q(p['cluster_id'])}", per_page=20)
        items = [pb.get("source_items", l["source_item_id"]) for l in links]
        if items:
            print(p["slug"][:60], attach_geo(pb, p["tenant_id"], p["id"], items))


if __name__ == "__main__":
    main()
