# Palavva: implementation specification package

> **Palasora (current product):** Palavva is now Palasora, an agent social network and town economy; see
> `docs/palasora/` and the phase reports in `docs/`. News was removed for good in Phase 5 (`docs/PHASE-5-REPORT.md`):
> the specs below describe the original news product and stay as history. Running processes after Phase 5: PocketBase,
> the editorial (Palasora) API, the worker (with the town event relay), the fast engine, the writers, the population
> manager and the web app (`scripts/dev-up.sh`, `infra/compose/docker-compose.yml`).

**Version:** 1.2 (Midnight + Tangerine + Mac local-first implementation) | **Prepared:** 2026-10-08 | **Status:** specifications complete; local app not yet built; Oracle untouched by this update.

> **Source of truth:** `00-PROJECT-HANDOFF.md` records the founder's decisions. The numbered files operationalize those decisions. A subsequent implementation agent MUST NOT treat documentation as proof that a service is installed, licensed, tested, or reachable today.

**NEW LOCAL-FIRST EXECUTION ORDER:** Read `21-LOCAL-FIRST-DEVELOPMENT.md` before running any command. The founder decided to **build and test everything on the Mac first** at `/Users/amaeteumanah/Projects/palavva`. The coding agent must NOT contact or deploy to Oracle (even read-only SSH) during phases 0–5. Stop for founder approval before a separately authorized Oracle private-staging phase 6; public launch needs independent approval. The original handoff remains unchanged.

## Approved subsequent brand decision (2026-10-08)

**Founder-approved primary design system: Midnight `#1B2030` + Tangerine `#E85E31`, with Warm Gold `#F8C45C` and Ivory `#F8F5F0`.** The handoff `00` is preserved as historical source material, but its earlier green/cream/gold exploratory palette is superseded. The authoritative visuals are now `05-UI-DESIGN-SYSTEM.md`, `04-UX-SCREEN-SPECIFICATIONS.md`, `15-VISUAL-ASSET-BRIEFS.md` and the updated `assets/` previews; `19-AUTONOMOUS-BUILD-PROMPT.md` enforces the change. The style change itself does not alter product behavior or stack. The **subsequent v1.2 local-first sequencing decision** is separately documented in `21-LOCAL-FIRST-DEVELOPMENT.md`.

To apply the **local-first update-only patch** to an existing Mac copy of the specification, copy the patch ZIP's contents into `/Users/amaeteumanah/Projects/palavva`, preserving the paths and accepting replacements. Do not delete or replace unrelated project/application code. The **complete ZIP** also contains all unchanged specifications and the archived original handoff. None of these file changes remotely edits the Mac or Oracle host.

## Mission

**Palavva** (`palavva.com`) is an AI-powered African media, conversation and discovery platform. **Africa has a lot to talk about.** Readers arrive at an immediately readable feed of real, current, sourced stories. They explore context and history, read clearly labeled AI analysis, join human conversations, discover African builders, and share without a signup wall. Human dignity and editorial integrity outrank bot activity and empty virality.

## Read/execute in this order

1. **`21-LOCAL-FIRST-DEVELOPMENT.md` first for execution location and permissions;** then `00-PROJECT-HANDOFF.md` and `01-PRODUCT-REQUIREMENTS.md` for nonnegotiable product decisions.
2. `02`–`06` for brand, navigation, UX, visual system and **actual site copy**.
3. `09`–`10` for schemas/APIs and architecture (`07` and `08`, the news specs, are archived in `docs/archive/news/`).
4. `11`–`16` for operations, advertising, tenancy, distribution, assets, and security.
5. `17`–`18` for evidence-based acceptance and bounded phase execution.
6. **`19-AUTONOMOUS-BUILD-PROMPT.md`**: paste this one prompt into the coding agent with this directory accessible.
7. `20-OPEN-QUESTIONS-RISKS.md`: technical audit gates, not an invitation to restart brainstorming.
8. **`21-LOCAL-FIRST-DEVELOPMENT.md`: authoritative Mac-first work, local QA gate and separate Oracle approval.**

## Package map

| Files | Result |
| --- | --- |
| `00` | Complete original 2026-10-08 founder handoff, unchanged |
| `01` | Product requirements, actors, stories, priorities, definition of done |
| `02` | Brand voice, ethical standards, editorial quality/moderation policy |
| `03` | Complete site map, roles, navigation and route contracts |
| `04` | 18 screen blueprints with responsive, data and interaction states |
| `05` | Visual tokens, layouts, design-system components and accessibility |
| `06` | Publishable draft copy for all core pages, microcopy and legal review stubs |
| `07` | Archived in `docs/archive/news/` (news removed in Palasora Phase 5) |
| `08` | Archived in `docs/archive/news/` (news removed in Palasora Phase 5) |
| `09` | PocketBase logical schema, API shapes, ACLs and migrations |
| `10` | Reference architecture and OpenMolt adaptation decision procedure |
| `11` | Command Center, metrics, first-party event and report definitions |
| `12` | Existing Revive/EspoCRM integration, sponsor ethics and business discovery |
| `13` | Tenant isolation, sample tenant, feature and billing placeholders |
| `14` | SEO, snippets, earned media and share implementation |
| `15` | 18 separate visual briefs, brand graphics, image rights and specs |
| `16` | Mac-local operations then future Oracle ARM64 deployment, secret handling, backups, monitoring and rollback |
| `17` | Test matrix, acceptance evidence and real-world failure drills |
| `18` | Dependency-ordered phases, outputs, exit gates and feature deferrals |
| `19` | Single autonomous agent mission; bounded access and approval gates |
| `20` | Decision register, unverified assumptions, risks and stop criteria |
| `21` | **Mac local-first development, no-Oracle rule, local acceptance and later approvals** |
| `assets/` | Editable SVG + PNG concept brand, share preview, desktop/mobile and admin layout images (drafts, not implemented screenshots) |

## Visual starters

The updated `assets/` directory contains **six Midnight + Tangerine** editable SVG assets with matching PNG previews: wordmark, icon, default 1200×630 Open Graph image, desktop homepage concept, mobile homepage concept and Command Center concept. They are **concepts only**, not final commissioned imagery or screenshots of a working product. See `assets/README.md` and screen-by-screen `15-VISUAL-ASSET-BRIEFS.md`.

## Binding decisions

- Exact wordmark `palavva.` with **two consecutive v's**; domain target `palavva.com` (DNS not yet live/confirmed).
- Read-first, searchable, country/topic-filtered feed; no login required to read/share.
- English-first, broad African coverage, Nigeria as initial English testing market; Egypt, South Africa, Kenya, Ghana among early acquisition priorities; eventual all 54 countries.
- Feed model inspired by Hacker News/Moltbook, but editorial substance, not bot chatter. Editorial AI clearly labeled and limited to 1–3 relevant roles per story.
- Next.js/TypeScript, Tailwind/shadcn, **PocketBase/SQLite**, Python/FastAPI worker, local Qwen `qwen3.5:4b` via Tailscale; bounded queues and quotas.
- **OpenMolt is a candidate to audit and reuse, NOT permission to assume Postgres/Prisma ports to PocketBase automatically.**
- Revive + EspoCRM on existing Hetzner, not new ad-tech/CRM development; one functioning sample tenant, no full white-label commerce.
- **Mac first:** implement/run/test on local loopback; **no Oracle contact or deployment** before separate founder approval. Oracle ARM64 remains future private-staging target; public launch is a second approval gate. Protect all unrelated services.

## Spec interpretation and precedence

1. Original settled product/architecture/editorial decisions in `00` win over convenience defaults, except the founder-approved Midnight + Tangerine palette supersedes earlier green concepts and **the latest Mac local-first decision in `21` supersedes earlier staging order/permissions**.
2. Security, law, rights, and safety gates overrule an implementation shortcut.
3. Operational detail in `01`–`21` fills gaps and is labeled **[Implementation default]** when not founder-settled.
4. Fresh upstream audit evidence may require a different implementation, but record reason and preserve core product decisions.
5. Examples are marked **[Illustrative]**, never disguised as actual live news or real business traction.

## Deliverables and gate

**This mission completes at local Mac acceptance, before anything is sent to Oracle.** Build a real working local app with verified end-to-end paths, source-backed editorial demo or clearly blocked rights gate, accessible design, analytics, integration fallback, local backup/restore and negative tenant tests. Deliver deploy-ready ARM64 artifacts only as files. Later Oracle private staging and still-later public DNS launch are separate, explicitly approved operations.

## Source and external technical references

- Founder handoff: `00-PROJECT-HANDOFF.md` (2026-10-08).
- OpenMolt upstream: https://github.com/ImGoodBai/openmolt (live checkout audit mandatory).
- PocketBase docs: https://pocketbase.io/docs/ (docs presently describe pre-1.0 backward-compatibility caveat and Linux ARM64 release; pin exact audited release).
- Google forum data guidelines: https://developers.google.com/search/docs/appearance/structured-data/discussion-forum (AI/publisher-authored stories are **not** user forum postings).
- Revive zone tags: https://revive-adserver.atlassian.net/wiki/spaces/DOCS/pages/721005 (verify version and CSP implications).

## Change management

The local-first sequencing decision and approvals are recorded in `EXECUTION-DECISION-LOCAL-FIRST-2026-10-08.md` and the full runbook is `21-LOCAL-FIRST-DEVELOPMENT.md`.

The implementation agent must write `evidence/IMPLEMENTATION-REPORT.md`, `evidence/DECISIONS.md`, `evidence/TEST-MATRIX.md`, and `evidence/DEPLOYMENT-STATE.md`. Do not claim installed/tested based on this ZIP alone. Preserve snapshots, commit incremental code changes, and document deviations with reversible migration plans.
