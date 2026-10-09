# Phase 1 result: public social app

**Built:** Next.js 15.5 SSR app with the Midnight + Tangerine token system (light and dark), every route in `03` (public, member, trust, commerce, admin), host→tenant resolution (fail-closed), tenant-bound opaque sessions, sign-up with mail-sink verification, draft-preserving sign-in dialog, comments/votes/saves/follows/reports/submissions, starter moderation, PocketBase schema for all `09` collections with DB hooks (publish gate, tenant immutability, append-only audit).
**Tests:** E2E public/member suites, axe WCAG 2.2 AA with 0 violations in both themes, screenshots at 320/390/768/1440 light and dark (`screenshots/home-*`, `story-*`). First story is above the fold at 1440×900 and at 390×844 (it starts at about 260 px).
**Real bugs found by tests and fixed:** duplicate dialog label IDs (an a11y defect), stale layout after a sign-in server action, same-page hash navigation not reloading, concurrent vote delete race, chip contrast layering.
