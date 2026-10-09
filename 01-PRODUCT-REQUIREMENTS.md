# 01. Product requirements and release contract

**Product:** Palavva. **Launch principle:** real content first, no forced login, real people matter. **Target:** staging MVP, not unreviewed production release.

## 1. Product outcome

A visitor opens the Palavva homepage and, without signing in, encounters an authentic African story, sees when/where it happened and the source, receives a short plain-English explanation, can follow an evidence-based conversation/history link, and share it directly. A small business can submit an authentic product for disclosure-based review. Editors can control sources, accuracy, publication, and spend; administrators see actual activity. An unavailable Qwen model or CRM must not take down the public feed.

## 2. Personas and permission boundary

| Persona | Needs | Allowed |
| --- | --- | --- |
| Anonymous reader | Timely discovery, context, sharing | All published public reading/search/filter/share, no writes |
| Signed-in reader/member | Discuss/follow/save/contribute | Own profile and member actions, subject to moderation |
| Business representative | Valid product discovery | Submit and manage only their verified organization records, no editorial ranking control |
| Editorial reviewer | Prove facts/correct mistakes | Draft/review/schedule/edit/correct by permission, never hidden edits |
| Moderator | Reduce abuse | Reports, quarantines, appeals/audit trail |
| Tenant admin | Run isolated branded community | Own tenant branding/content/metrics/settings only |
| Platform admin | Operate platform safely | Cross-tenant administrative capabilities by explicit elevated role, fully audited |
| Platform AI editorial role | Sourced contribution | Draft only through worker with limited source context, no public identity deception |
| External agent | Future scoped API integration | Disabled in MVP unless security/abuse tests fully pass |

## 3. P0 acceptance stories

- **PR-001 Public feed:** SSR homepage at `/` displays real approved published stories above fold; `Live`, `Trending`, `Random`, `New`, `Top`, `Discussed` and `Discover` return nonempty genuine records when records exist. `Live` means freshness, not invented activity. In empty staging state show clearly marked sample content or a real empty state.
- **PR-002 Navigation:** country + industry independent combinable URL filters; 54 country metadata entries possible, seeded priority set; pages have stable links and breadcrumbs.
- **PR-003 Detail:** verified occurrence/context, source URLs and timestamps, evidence list, AI disclosure, human replies, optional Time Lens, correction status and share options.
- **PR-004 Account:** member sign-in, logout, secure session; unauthenticated comment/vote/save invokes accessible login overlay and restores draft/destination.
- **PR-005 Participation:** members can post moderated comments, vote once, save, report; robust duplicates and abuse limits; real counts excluding synthetic AI activity.
- **PR-006 News:** enable only permission-reviewed feeds; ingest, normalize, classify, dedupe, cluster updates, research and edit; provenance retained.
- **PR-007 AI:** Ollama through Tailscale provides grounded analysis when reachable; human review gate for sensitive stories; budget and pause controls, Qwen offline resilience.
- **PR-008 Distribution:** canonical SSR pages, robots/sitemap, OG images and metadata, real FB/X/WhatsApp/copy shares, referral measurement.
- **PR-009 Command Center:** admin sees real live source health, editorial queue, AI runs/errors/quotas, traffic aggregates, content moderation, sponsor bridges, tenant status, jobs and backups.
- **PR-010 Commercial:** form inquiry stored securely and forwarded to validated EspoCRM integration when available; existing Revive zones loaded only if approved, always labeled `Sponsored`.
- **PR-011 Tenant:** Palavva and one sample tenant have distinct scoped branding, content, credentials, metrics; automated forbidden cross-tenant access tests.
- **PR-012 Ops:** reproducible ARM64 Compose stage; off-host backup and test restore; TLS only for approved ingress; observable startup, restart and rollback.

## 4. Priorities

**P0:** PR-001–012 in staging with transparent constraints. **P1 after useful P0:** newsletters, richer time-axis filters, moderated business Q&A, translations, human-curated explainers, additional region-sourced feeds, advanced search. **P2 deferred:** marketplace payments, self-service white-label billing, subscription checkout, video studio, ad auction, elaborate autonomous agent society, massive user-owned bot economy, expensive BI platform, multi-region deployment.

## 5. Product behavior and guardrails

- Never invent a headline, source, subscriber, or revenue. Sample posts must be explicitly tagged `Demo content` and excluded from public SEO/sitemaps.
- Disallow public publishing when evidence state is incomplete or rights unclear. Sensitive politics, elections, health, finance and personal allegations **always** require an explicit human approval step; no unreviewed agent-generated story goes live.
- User contributions are clearly distinguishable from published journalism, platform AI, paid placements and organizations.
- A failed RSS fetch yields a source error; not a blank deletion. A Qwen outage defers AI jobs and keeps reading available. A failed CRM call saves a local lead for retriable forwarding.
- Respect culture and pluralistic participation. Keep editorial AI independent of sponsored campaigns. No automated reciprocal bot voting or comments.

## 6. Measurable readiness, not invented targets

Metrics to instrument from day 1: real published items/week, source freshness, dedup rate, citation coverage, editorial corrections, content shares vs referrals, unique pseudonymous browsers (estimate, not people), human signup/comment/save activity, repeat visitors, AI time/cost/failure, backup age, error rate, sponsor leads, tenant isolation violations. **[Implementation default]** Operational stage alert thresholds: zero overdue critical backups; zero unauthorized cross-tenant exposures; zero unreviewed high-risk publications; no secrets in logs; no public Ollama/DB ports. Baseline engagement metrics before setting numeric growth targets.

## 7. Nonfunctional targets [implementation defaults to verify, not claims]

- HTML meaningful without client JS, mobile-first, minimum WCAG 2.2 AA target for core journeys.
- Typical public read loads should avoid calling LLMs; keep server rendered hot paths cached where safely possible.
- Initial performance budgets for ordinary 4G testing: LCP <= 2.5s at p75 where controllable; CLS <= 0.1; no unexpected horizontal overflow at 320 px. Measure rather than report assumed success.
- Secure authentication, account deletion/privacy workflows, audit trails, source rights, backups, graceful degradation, least privilege.
- SQLite single-writer load tests; runtime architecture uses repository interfaces to permit future PostgreSQL migration.

## 8. Definition of done

Code merged + tests executed + real browser screenshot/API evidence + source provenance + authorization checks + documented deployment/rollback + no unapproved external side effects. If dependent service unreachable, a graceful fallback and an explicit **BLOCKED/DEGRADED** mark are required, never fake pass.
