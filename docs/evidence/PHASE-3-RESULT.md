# Phase 3 result: discovery and analytics

**Built:** canonical metadata, OG/Twitter tags, dynamic 1200×630 share cards (revision-versioned), sitemap (published, non-demo only), robots (`Disallow: /` until launch is authorized), `NewsArticle` JSON-LD for non-demo pieces (no forum schema), WhatsApp/Facebook/X/copy share intents; consent-gated first-party events → tenant/date NDJSON → DuckDB ETL → `aggregated_metrics` → Audience Analytics, with distinct zero / delayed / not-connected states.
**Tests:** E2E T-025/T-026/T-027/T-028 pass. Gaps: no non-demo piece has been published yet (Article schema unexercised), and the 30-day purge was not exercised.
