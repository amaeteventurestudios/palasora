# v1.8+ 28-issue tracker

Status values: **done** (implemented + tested + evidence), **partial** (working slice, remainder listed), **blocked** (needs an approval or external access), **not started**.
Spec: `docs/specs/PALAVVA_28_ISSUES_MASTER_SPEC_2026-10-11.md`. Baseline: `BASELINE.md`.

| Issue | Baseline | Implementation | Tests | Screenshots | Status | Blockers / next |
| --- | --- | --- | --- | --- | --- | --- |
| 01 Restore homepage | v1.7 commit `4c89cad`/`7f07972` unmounted `Hero`, strip `LiveStatStrip`, `ExchangeTeaser`; replaced by `WelcomeStrip`, rail counters, `InlinePromo` after 4th post | `app/page.tsx` re-mounts the three original components above the feed (feed, tabs, sidebar, rails unchanged); duplicates (welcome line, rail counters, inline promo) removed from home only, components kept. Phones: Exchange folds to a one-line live summary with the no-real-money disclosure; tap expands title + both actions. Counters remain live DB aggregates with eligible-vs-active wording | V17-01, S01, UI-01, V15-02, V17-08 rewritten to the restored contract; 46/46 affected Playwright specs, vitest 71/71, tsc; manual: both hero CTAs and Explore Exchange navigate at 390 and 1440; 0 px horizontal overflow at 320/360/390/768/1024/1440/1920/2560 | `BEFORE-AFTER/issue01-before-home-*`, `issue01-after-home-*` (dark desktop/mobile, light desktop, mobile expanded) | **done** | PMI shows 1,000/+0.0 % with hundreds of trades → ISSUE-15 |
| 02 OASIS + Letta persona/memory | | | | | not started | |
| 03 Local Pulse | | | | | not started | |
| 04 Full-width admin shell | Every page except Event Pipeline went through `AdminPage` (`mx-auto max-w-[1400px]`); `editorial/[id]` capped at `max-w-6xl`; fixed 5–9-column KPI rows; on phones Agent City and Geo QA scrolled sideways (grid items `min-width:auto` let wide tables stretch cards; an `sr-only` label escaped an unpositioned scroll box); sparkline cards clipped 9-digit values | `AdminPage` full width (prose kept at 80ch); shared adaptive `.kpi-grid` (auto-fill, ≥13rem desktop, 2-up phones) replaces 13 hand-tuned rows; overflow-safe `MetricCard`/population KPI values; admin-scoped CSS: grid/card children `min-width:0`, positioned scroll boxes; Control Room setting groups flow into 2 columns ≥1800px (3 with the scope rail); `data-testid=admin-content` hook | `tests/e2e/v18-admin-layout.spec.ts`: discovers all 32 `app/admin/**/page.tsx` routes (new ones auto-included) × 390/1440/2560: HTTP < 400, main block ≥95 % of available width, 0 px sideways scroll, every metric value set to `1,000,000,000` without clipping — 4/4 pass | `BEFORE-AFTER/admin/*-1440.png`, `*-2560.png` (isolated test stack, fixture data — not live numbers); founder 'before' = package screenshots 4.57.55 etc. | **partial** | Sticky table headers, 25/50/100/250/All tables and per-page 2–3-column re-layout of long pages belong with the shared DataTable (ISSUE-06) and each page's own issue |
| 05 Jev audit | | | | | not started | |
| 06 Explainable admin | | | | | not started | |
| 07 Exceptions/Editorial | | | | | not started | |
| 08 Editorial AI Runs | | | | | not started | |
| 09 Social & Sources | | | | | not started | |
| 10 Languages/translation | | | | | not started | |
| 11 GEO QA | | | | | not started | |
| 12 Trend Audit | | | | | not started | |
| 13 Moderation | | | | | not started | |
| 14 Pals Economy | | | | | not started | |
| 15 Exchange | | | | | not started | PMI 1,000 / +0.0 % with ~390 trades today (observed at baseline) |
| 16 Revive advertising | | | | | not started | |
| 17 Payments | | | | | not started | |
| 18 EspoCRM/Revive pipeline | | | | | not started | |
| 19 Businesses & Founders | | | | | not started | |
| 20 llms.txt / SEO | | | | | not started | |
| 21 Infrastructure & Services | | | | | not started | `backup.sh` omits `spend.db` (found at baseline) |
| 22 Settings & Audit | | | | | not started | |
| 23 Users & Access / RBAC | | | | | not started | admin host spelling `admin.palavva.com` vs `admin.palava.com` unresolved — needs founder confirmation before any DNS |
| 24 Account lifecycle/email | | | | | not started | |
| 25 Realtime homepage | | | | | not started | |
| 26 My Agents performance | | | | | not started | |
| 27 Sidebar Resources | | | | | not started | |
| 28 Games | | | | | not started | |
