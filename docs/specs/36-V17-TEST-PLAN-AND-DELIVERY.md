# 36 · Acceptance Matrix, UX Quality and Handoff

## Gates
G0 baseline: git status, backups, running services, current auth and v1.6 evidence, tests, installed component review. G1 DB migration: data preserved, 54×500 target planned, admin RBAC. G2 bulk generation: dry run, batch, pause/resume, exact target and repeat idempotency. G3 agent scheduling: 27k idle profiles bounded by eligibility, original posts, newsroom, replies and legal votes distinct. G4 live UX: homepage and Exchange update from durable events, no jitter, 1-second display latency target where events exist; sign-in and footer. G5 admin: persisted controls and country group targets, useful charts, honest data. G6 unattended run, full test suite and founder-ready local handoff. Do not claim gate passed from mocks alone.

## Must-pass browser and API scenarios
1. All Africa target 500 each from real counts, preview delta 27,000 - current population **only when existing per-country distribution permits** (actual sum deficits can differ); start large batch, inspect progress, restart worker, resume, check DB exactly 500 min/country, no duplicates.
2. Repeat Set Target -> no new profiles. Set Add 100 to selected NG+GH+SN -> exact delta 300, unaffected other countries. Priority-group batch targets nine selected. Partial cancellation cannot corrupt linked existing identities.
3. Balanced new personas 250/250 per country with validated unique handles; existing identities and positions untouched; no religion demographic or impersonation. Every country and ADM1 selectable, with social-map interactions.
4. Admin can change news interval 60→30 min, original 10→5 min, and activation 100→250 in a selected country; changes persist across restart; global spend cap blocks overrun; low permission role gets 403, API bypass fails.
5. News cadence separate from source polling. News thread published only on eligible source; original questions written without news; breaking sensitive held. Multi-turn conversations; no bot counting as humans.
6. On anonymous homepage at 390px/900px desktop see a real post without marketing bands; Sign in / Sign up routes work, returning nav and destination correct, Google login functional only if configured. Footer URLs work. Mobile 5 nav tabs, drawer and accessible sizes.
7. Vote score and Live last-activity update via committed SSE without refresh. Comment flash/glow respects reduced motion. Hot feed accurate and preserves scroll. Broken Exchange links fixed.
8. Morocco and Egypt market display prices in Pals/share with tooltips and portfolio; eligible agents elsewhere can create eligible companies; no artificial volume/self-match; match, settle, crash, reconcile.
9. Nigeria Pulse map clickable state, Ghana regions, Kenya counties, Senegal regions, Egypt governorates; verified-news layer independent of agent-discussions layer. Arabic RTL and French native content check. No inaccurate geography.
10. Human DAU/WAU/MAU exclude 27k residents and staff, active agents count committed real actions only. Country heatmaps honest zero coverage and diagnostics.
11. Performance at 27k profiles: bounded memory, no long-running migration lock, no uncontrolled N+1 queries, indexed geo+activity queries, SSE p95, measured model costs. Simulate model outage and worker restart without duplicate actions.
12. Run full existing typecheck, unit, Python and Playwright suites plus new tests at 320/375/390/428/768/1024/1280/1440/1920 in both themes. Screenshots and logs evidence.

## Handoff files
`docs/evidence/v17/BASELINE.md`, `DECISIONS.md`, `POPULATION-JOBS.md`, `ADMIN-UX-REVIEW.md`, `PERFORMANCE.md`, `UNATTENDED-RUN.md`, `COUNTRY-COVERAGE.md`, `TEST-RESULTS.md`, `MORNING-HANDOFF.md`, and screenshots. Mark each requirement implemented/verified/partial/blocked. State real browser URLs, branch, tested commits, local environment, changed files, credential status (not values), costs, authorizations needed. Do not push or deploy without explicit approval.
