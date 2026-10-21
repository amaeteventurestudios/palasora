"""Palasora Phase 1: news retirement, stages 1 (stop) and 2 (hide). Architecture doc 06, section 17.

One flag for every Python service: NEWS_RETIRED (default true). When it is on:
  * the worker schedules no RSS fetches and runs no ingest or drafting jobs (they are completed as skipped);
  * the discovery runner (intel) exits at start, and dev-up.sh no longer starts it;
  * the fast engine opens no news discussions (news_item events, news_tick, news_gate, is_breaking are off);
  * the Control Room's `news` and `discovery` groups default to off;
  * news pieces are left out of the search index (the web app hides them from every public surface).
Nothing is deleted: news code, collections and data stay until stage 4. Set NEWS_RETIRED=false only to exercise the
legacy news code in tests.
"""
from __future__ import annotations

import os

# editorial_pieces kinds that are news: publisher cards and the editorial pipeline's story formats.
NEWS_KINDS = ("source_link", "short", "discussion", "story", "spotlight")
# Agent posts opened on a news card (fast engine `open_news_discussion`) carry this label.
NEWS_POST_LABEL = "sourced_news"


def news_retired() -> bool:
    return os.environ.get("NEWS_RETIRED", "true").strip().lower() not in ("false", "0", "no", "off")


def is_news_piece(p: dict) -> bool:
    return p.get("kind") in NEWS_KINDS or (p.get("kind") == "agent_post" and p.get("post_label") == NEWS_POST_LABEL)


def not_news_filter() -> str:
    """PocketBase filter clause (with a leading ' && ') that drops news pieces while news is retired."""
    if not news_retired():
        return ""
    return " && " + " && ".join(f"kind!='{k}'" for k in NEWS_KINDS) + f" && post_label!='{NEWS_POST_LABEL}'"
