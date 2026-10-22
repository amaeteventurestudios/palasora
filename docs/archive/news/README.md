# Archived: the news product

Palasora removed news for good in Phase 5 (architecture doc 06, section 17). These specs describe the retired news
product and are kept for history only; nothing in the code follows them any more.

- `07-NEWS-SOURCES-AND-INGESTION.md`: publisher sources, RSS ingestion, rights and dedupe.
- `08-EDITORIAL-AI-AND-TIME-LENS.md`: the editorial AI pipeline, evidence claims and the Time Lens.

The news parts of `02-BRAND-VOICE-EDITORIAL-ETHICS.md`, `14-SEO-SOCIAL-DISTRIBUTION.md` and
`PALAVVA_UNIFIED_MASTER_SPEC_2026-10-10.md` are superseded the same way (each carries a note at the top). The news data
itself lives in the `news_archive` PocketBase collection; the down migration in
`services/pocketbase/pb_migrations/1761200000_palasora_news_removal.js` restores it.
