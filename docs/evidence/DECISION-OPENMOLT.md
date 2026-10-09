# DECISION-OPENMOLT: selective reuse of ideas (Path B), no code copied

**Status:** Decided 2026-10-08 by the build agent, per the procedure in `10-TECH-ARCHITECTURE.md`. Reversible.
**Audited commit:** `ImGoodBai/openmolt@1be0e2804fe63f53b4308762842ae90d7ca41052` (2026-02-04). MIT license, "Copyright (c) 2025 Moltbook".

## Feature reuse matrix

| OpenMolt feature | Observed implementation | Palavva decision |
| --- | --- | --- |
| Feed sorting (hot/new/top/rising) | SQL `ORDER BY` in `src/backend/services/PostService.js` (Postgres `EXTRACT(EPOCH…)`) | **Adapt idea only.** Palavva's `trending` uses the same time-decay shape, `(score+1)/(age_h+2)^1.5`, computed in TypeScript over human-only signals. Attributed in `apps/web/lib/feed.ts` |
| Posts/comments/votes | Express + `pg`, agent API keys | **Replace.** Humans-first model with tenant-scoped PocketBase records and AI comments separated |
| Auth | Google OAuth only, JWT via `jose` | **Replace.** PocketBase password auth + server-side opaque sessions bound to tenant |
| Submolts (communities) | Postgres tables | **Not reused.** Palavva communities are country/topic filters plus a light `communities` collection |
| UI components (Radix, Tailwind 3, framer-motion) | Generic social UI, Moltbook branding | **Not reused.** Midnight + Tangerine editorial design system built from `05` |
| Tests | Jest, 36 tests, 3 failing | Not applicable |
| Deploy (Vercel/Railway) | `vercel.json`, `railway.json`, committed `.env.production` | **Drop.** Unsafe pattern; not applicable to Mac/Oracle |

## Paths compared

| Criterion | A: fork + PocketBase adapters | B: selective extraction, Palavva-native service |
| --- | --- | --- |
| Effort | High: rewrite every Express/`pg` call, fix failing tests and typecheck, upgrade Next 14.1 → 15 | Medium: build only what Palavva needs |
| Security | Inherits 21 advisories (3 critical, incl. Next middleware auth bypass) until upgraded | Clean dependency tree (`pnpm audit`: 0 known) |
| Product fit | Agent-centric "social network for AI agents", which conflicts with the humans-first rule | Built around editorial evidence, human/AI labels and tenancy |
| Data model | Prisma/Postgres; not a PocketBase drop-in | PocketBase collections from `09` |
| ARM64 | Fine either way | Fine |
| Maintainability | 35 commits, single maintainer, last commit 2026-02-04 | Owned code |

**Choice: Path B.** No OpenMolt source files are copied into Palavva. The only borrowed element is the general time-decay ranking idea (also widely published as the "Hacker News/Reddit gravity" formula), credited in a code comment and `docs/OSS-ATTRIBUTION.md`.

**What would change this:** if a later audit finds substantial, well-tested OpenMolt UI worth reuse, port it file-by-file with the MIT notice preserved.
