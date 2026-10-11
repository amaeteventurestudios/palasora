"""Source cards (v1.5, unified master W28-W31): one rights-cleared feed item -> one attributed public card.

Why: AI drafting (pipeline.draft_cluster) is slow and budgeted, so most countries had no items at all and the
edition switch had nothing to show. A source card is the publisher's own title and permitted excerpt, verbatim,
with author, date, licence and link; nothing is rewritten or invented. Agents then discuss the card (the event
engine treats a new card as a `news_item` event).

Rules:
  - only sources with rights_status='approved' and usage_policy permitting an excerpt reach this module;
  - one card per canonical URL across all feeds; a second feed (e.g. the same Global Voices story in the Mali and
    Niger country feeds) only ADDS its subject-country tag and attribution, never a duplicate card;
  - countries come from the feed's declared subject-country scope plus the classifier's evidence, never from the
    publisher's location alone (a South African outlet reporting on Ghana is tagged GH by the classifier);
  - high-risk items are created as needs_review (Command Center queue), not published;
  - published_at is the publisher's date, so ranking and freshness labels are honest.
"""
from __future__ import annotations

import hashlib
import logging
import re
from datetime import datetime, timezone

from .pb import PB, PBError, q

log = logging.getLogger("palavva.sourcecards")
CARD_VERSION = "source-card-v1"
EXCERPT_WORDS = 70


def _pbdate(d: datetime) -> str:
    return d.astimezone(timezone.utc).strftime("%Y-%m-%d %H:%M:%S.000Z")


def _slug(title: str, url: str) -> str:
    base = re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-")[:60].strip("-")
    h = hashlib.sha1(url.encode()).hexdigest()[:8]
    return f"{base or 'source'}-{h}"


def _excerpt(text: str) -> str:
    words = (text or "").split()
    cut = " ".join(words[:EXCERPT_WORDS])
    return cut + ("…" if len(words) > EXCERPT_WORDS else "")


def _attribution(source: dict, item: dict) -> dict:
    return {"name": source.get("attribution_text") or source.get("publisher_name") or "", "url": item.get("canonical_url") or "",
            "title": item.get("title") or "", "published_at": item.get("published_at") or "", "language": item.get("language") or "en",
            "author": item.get("author") or "", "license": source.get("license_name") or "", "license_url": source.get("license_url") or "",
            "source_id": source.get("id") or ""}


def upsert_source_card(pb: PB, source: dict, item: dict, countries: list[str], topics: list[str], risk: str, published: datetime) -> dict | None:
    """Create or enrich the card for one stored source_item. Returns the card row (or None when not eligible)."""
    tid = source["tenant_id"]
    url = item.get("canonical_url") or ""
    if not url or source.get("rights_status") != "approved" or (source.get("usage_policy") or "") not in ("permitted_excerpt", "licensed_full"):
        return None
    subject = sorted({c for c in (source.get("countries") or []) + list(countries or []) if re.fullmatch(r"[A-Z]{2}", c or "")})
    existing = pb.first("editorial_pieces", f"tenant_id={q(tid)} && kind='source_link' && source_url={q(url)}")
    if existing:
        merged = sorted(set(existing.get("country_codes") or []) | set(subject))
        srcs = existing.get("sources_json") or []
        if not any(s.get("source_id") == source["id"] for s in srcs):
            srcs = srcs + [_attribution(source, item)]
        if merged != sorted(existing.get("country_codes") or []) or len(srcs) != len(existing.get("sources_json") or []):
            existing = pb.update("editorial_pieces", existing["id"], {"country_codes": merged, "sources_json": srcs,
                                                                     "origin_country": existing.get("origin_country") or (merged[0] if merged else "")})
        return existing
    review = "needs_review" if risk == "high" else "published"  # the row is created unpublished, then passes the DB gate
    data = {
        "tenant_id": tid, "slug": _slug(item.get("title") or "", url), "kind": "source_link", "headline": (item.get("title") or "")[:300],
        "lede": _excerpt(item.get("permitted_excerpt") or ""), "body_blocks_json": {"card": CARD_VERSION}, "author_type": "source",
        "risk_tier": risk or "low", "review_status": "needs_review", "revision": 1, "is_demo": bool(item.get("is_fixture")),
        "country_codes": subject, "topic_slugs": topics or [], "language": item.get("language") or "en", "original_language": item.get("language") or "en",
        "editor_pick": False, "sources_json": [_attribution(source, item)], "evidence_state": "complete", "claim_check_status": "NOT_APPLICABLE",
        "human_comment_count": 0, "ai_contribution_count": 0, "vote_score": 0, "save_count": 0, "still_developing": False,
        "thread_state": "active", "publish_path": "source_card", "post_label": "sourced_news", "source_url": url, "source_item_id": item["id"],
        "origin_country": subject[0] if subject else "", "published_at": _pbdate(published), "first_published_at": _pbdate(published),
        "last_activity_at": _pbdate(published), "risk_basis": "" if review == "published" else "classifier risk tier high: needs editor review",
    }
    try:
        card = pb.create("editorial_pieces", data)
    except PBError as e:
        if e.status == 400:  # slug collision race (same URL inserted concurrently) is the only tolerated 400
            again = pb.first("editorial_pieces", f"tenant_id={q(tid)} && kind='source_link' && source_url={q(url)}")
            if again:
                return again
        raise
    pb.create("discussions", {"tenant_id": tid, "piece_id": card["id"], "status": "open", "human_comment_count": 0, "ai_comment_count": 0})
    if review == "published":
        try:
            card = pb.update("editorial_pieces", card["id"], {"review_status": "published", "reviewer_id": "system:source-card-validator"})
            _enqueue_news_event(pb, tid, card)
        except PBError as e:  # gate refused (paused, rights changed): stays in the editor queue, reason recorded
            card = pb.update("editorial_pieces", card["id"], {"risk_basis": f"source-card gate: {e}"[:1900]})
    pb.audit(tid, "source_card.created", "editorial_pieces", card["id"], {"source_id": source["id"], "review": review, "countries": subject}, actor_type="system", actor_id="worker")
    return card


def upsert_link_card(pb: PB, source: dict, item: dict, countries: list[str], topics: list[str], risk: str, published: datetime, basis: str) -> dict | None:
    """v1.6 LINK SIGNAL: a discovered publisher's own headline + link-out, no excerpt, no AI text (DB gate path 5).
    basis: why the card is tagged with its countries ('named in the headline' or 'publisher based in XX')."""
    tid = source["tenant_id"]
    url = item.get("canonical_url") or ""
    if not url or source.get("usage_policy") != "link_only" or source.get("rights_status") not in ("pending", "approved"):
        return None
    existing = pb.first("editorial_pieces", f"tenant_id={q(tid)} && kind='source_link' && source_url={q(url)}")
    if existing:
        return existing
    subject = sorted({c for c in countries if re.fullmatch(r"[A-Z]{2}", c or "")})
    publish = risk == "low"
    att = {**_attribution(source, item), "license": "Link only: the publisher's headline and a link to the original", "via": "discovered via the GDELT Project",
           "basis": basis}
    data = {
        "tenant_id": tid, "slug": _slug(item.get("title") or "", url), "kind": "source_link", "headline": (item.get("title") or "")[:300], "lede": "",
        "body_blocks_json": {"card": "link-signal-v1", "basis": basis}, "author_type": "source", "risk_tier": risk or "low", "review_status": "needs_review",
        "revision": 1, "is_demo": False, "country_codes": subject, "topic_slugs": topics or [], "language": item.get("language") or "en",
        "original_language": item.get("language") or "en", "editor_pick": False, "sources_json": [att], "evidence_state": "link_only",
        "claim_check_status": "NOT_APPLICABLE", "human_comment_count": 0, "ai_contribution_count": 0, "vote_score": 0, "save_count": 0,
        "still_developing": False, "thread_state": "active", "publish_path": "link_signal", "post_label": "sourced_news", "source_url": url,
        "source_item_id": item["id"], "origin_country": (source.get("countries") or [""])[0], "published_at": _pbdate(published),
        "first_published_at": _pbdate(published), "last_activity_at": _pbdate(published),
        "risk_basis": "" if publish else f"classifier risk tier {risk}: needs editor review",
    }
    try:
        card = pb.create("editorial_pieces", data)
    except PBError as e:
        if e.status == 400:
            again = pb.first("editorial_pieces", f"tenant_id={q(tid)} && kind='source_link' && source_url={q(url)}")
            if again:
                return again
        raise
    pb.create("discussions", {"tenant_id": tid, "piece_id": card["id"], "status": "open", "human_comment_count": 0, "ai_comment_count": 0})
    if publish:
        try:
            card = pb.update("editorial_pieces", card["id"], {"review_status": "published", "reviewer_id": "system:link-signal-validator"})
            _enqueue_news_event(pb, tid, card)
        except PBError as e:
            card = pb.update("editorial_pieces", card["id"], {"risk_basis": f"link-signal gate: {e}"[:1900]})
    pb.audit(tid, "link_signal.created", "editorial_pieces", card["id"], {"source_id": source["id"], "published": card.get("review_status") == "published",
                                                                          "countries": subject, "basis": basis}, actor_type="system", actor_id="intel")
    return card


def _enqueue_news_event(pb: PB, tid: str, card: dict) -> None:
    """Hand the card to the agent event engine (idempotent per card)."""
    try:
        pb.create("agent_events", {"tenant_id": tid, "event_key": f"news:{card['id']}", "event_type": "news_item", "source_kind": "piece",
                                   "source_id": card["id"], "piece_id": card["id"], "country_codes": card.get("country_codes") or [],
                                   "topics": card.get("topic_slugs") or [], "language": card.get("language") or "en",
                                   "payload": {"headline": card.get("headline", "")[:300]}, "status": "queued"})
    except PBError as e:
        if e.status != 400:
            raise


def backfill(pb: PB, tid: str, days: int = 30) -> int:
    """Create cards for already-stored items (idempotent: one card per URL)."""
    from datetime import timedelta
    from .ingest.classify import classify
    since = _pbdate(datetime.now(timezone.utc) - timedelta(days=days))
    n = 0
    sources = {s["id"]: s for s in pb.list_all("sources", f"tenant_id={q(tid)}")}
    for it in pb.list_all("source_items", f"tenant_id={q(tid)} && published_at >= {q(since)} && is_fixture=false"):
        src = sources.get(it["source_id"])
        if not src:
            continue
        cls = classify(it["title"], it.get("permitted_excerpt") or "", src.get("countries") or [], src.get("topic_ids") or [], it.get("language") or "")
        if not cls.africa_relevant:
            continue
        pub = datetime.strptime(it["published_at"][:19], "%Y-%m-%d %H:%M:%S").replace(tzinfo=timezone.utc)
        if upsert_source_card(pb, src, it, cls.countries, cls.topics, cls.risk, pub):
            n += 1
    return n


if __name__ == "__main__":
    import os
    _pb = PB(os.environ["PB_URL"], os.environ["PB_SERVICE_EMAIL"], os.environ["PB_SERVICE_PASSWORD"])
    _t = _pb.first("tenants", "slug='palavva'")
    print("cards:", backfill(_pb, _t["id"]))
