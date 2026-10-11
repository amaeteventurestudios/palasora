# v1.6 open-source evaluation (founder directive 2026-10-10, §2–§3)

Rule applied: reuse the existing durable queue, PocketBase, write service and engines; add a component only where it
replaces custom work we would otherwise write, and only if it runs within this machine's limits (8 CPU, 32 GB RAM,
**27 GB free disk at the start of the night, 94 % used**; Docker daemon not running, one unrelated Colima VM in use by
another project, which was not touched).

## Adopted

| Component | Licence | What it does in Palavva | Why it, not custom code |
|---|---|---|---|
| **GDELT DOC 2.0 API** | open data, attribution | Finds recent articles from publishers *based in* each of the 54 countries (any language) → publisher discovery + link-only signals | One query per country covers national, regional and niche outlets; no key. Limit: 1 request / 5 s, and this IP was throttled (HTTP 429) for most of the night: the runner backs off and stops the sweep instead of hammering it. |
| **Wikidata SPARQL** | CC0 | Seeds the publisher registry: newspapers, news agencies, online papers, broadcasters, radio/TV stations, universities with official websites, per country | Structured, verified, covers all 54; replaced the "search for publishers" need for the first pass. 1,960 publishers registered in one run (53 of 54 countries; Seychelles had none in Wikidata). |
| **trafilatura 2.0** | Apache-2.0 | Feed discovery on publisher homepages (`feeds.determine_feed`), used with Palavva's own SSRF-safe fetcher | Mature, maintained, light (pure Python). Replaces both custom feed discovery and, for static news pages, Crawl4AI. |
| **lingua-language-detector 2.1** | Apache-2.0 | Verifies the language of every agent text before a label is stored (en/fr/ar/pt/sw + zu/yo/sn/so/xh/st/tn) | Offline, accurate on short text, no service to run. |
| **OpenRouter** (HTTP API) | commercial API | Paid writer behind an atomic spend ledger | Founder-selected; one key reaches OpenAI and Anthropic models; live catalogue prices; per-request `max_price`. |

## Evaluated and not deployed tonight (with reasons)

| Candidate | Finding | Decision |
|---|---|---|
| **FreshRSS** | Feed aggregator with its own DB and UI. Palavva already has a hardened RSS/Atom parser (XXE/injection tests), conditional GET, per-source health and a rights gate. | Not deployed: it would duplicate ingestion and move the rights gate outside the app. Revisit as an *operator reading tool* only. |
| **SearXNG** | Good for discovering publishers by query; it scrapes third-party search engines (their terms vary), and needs a container. Wikidata + GDELT already registered ~1,950 publishers for 53/54 countries. | Deferred. Pinned config exists in `~/Projects/noveniqe-seo-search-engine` to reuse. Use case left: the handful of countries with < 5 registered publishers (Comoros, Eswatini, Lesotho, São Tomé, Seychelles). |
| **ChangeDetection.io** | Monitors pages without feeds. Of the checked publishers, those without feeds mostly publish sitemaps (`sitemap_only`), which can be read directly. ~500 MB image + container runtime. | Deferred: sitemap reading is the lighter path; ChangeDetection.io stays the option for official notice pages without feeds or sitemaps. |
| **Crawl4AI** | Browser-based extraction (Playwright, ~1 GB+). Palavva does not store or republish article bodies (link-only and permitted excerpts only). | Not needed; trafilatura covers metadata/feeds on static pages. |
| **Linkding** | Bookmark manager. The publisher registry already lives in PocketBase `sources` (rights status, usage policy, health, discovery provenance). | Not deployed: a second registry would drift from the gate's source of truth. |
| **n8n** | Workflow orchestration. The durable SQLite queue + engines already orchestrate collection → classification → events → writers with idempotency keys and audits. | Not deployed (would add a second orchestrator with its own state). |
| **Uptime Kuma** | Service monitoring UI. Command Center → Pan-African engine now shows process liveness, queue backlog, dead letters and discovery runs. | Deferred; useful once deployed beyond one machine. |
| **Syncthing** | File sync between machines. Everything runs on one machine tonight. | Not needed. |
| **Celery / Temporal** | Durable task execution. The existing queue already provides leases, retries, dead letters, deferrals and idempotency; v1.6 added `exclude` and turn priority. | Not adopted: no capability gap measured. |
| **PydanticAI / LangGraph** | Agent frameworks. Palavva's agents are decide→write→validate→publish with deterministic rules and one structured call; no tool loops are needed. | Not adopted. |
| **Paperclip / Hermes** | Agent coordination / research runtimes. Nothing in the overnight goal requires long-running research agents. | Not adopted tonight. |
| **Jev** | Structured decision model; adapter exists and fails closed. | Not used: no Jev credentials; the deterministic decider handled every decision (recorded per row). |
