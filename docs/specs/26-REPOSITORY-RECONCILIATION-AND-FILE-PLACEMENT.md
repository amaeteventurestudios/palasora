# 26. GitHub Inventory, Safe Merge and Local File Placement

**Verified GitHub repository:** `amaeteventurestudios/palavva`, default branch `main`, examined 2026-10-10. The user's Finder screenshot additionally shows local files and folders that may not be committed. The GitHub listing is **not** a statement that local branch `ai-social-v1.4` has been pushed. Do not overwrite or assume branch parity.

## Folder path
`/Users/amaeteumanah/Projects/palavva/`

## What GitHub currently contains
Top level: numbered documents `00-PROJECT-HANDOFF.md` through `24-EXTENDED-ACCEPTANCE-MATRIX.md`, plus `BRAND-DECISION-2026-10-08.md`, `EXECUTION-DECISION-LOCAL-FIRST-2026-10-08.md`, `OVERNIGHT-BUILD-REPORT.md`, `PACKAGE-MANIFEST.json`, `PALAVVA_COMPLETE_PROJECT_HANDOFF.md`, `PALAVVA_LOCALE_TRENDING_LOCAL_PULSE_HANDOFF_2026-10-09.md`, `README-UPDATE-V1.3.md`, `README.md`, and code directories `apps`, `assets`, `docs`, `infra`, `scripts`, `services`. The local Finder screenshot additionally shows `MORNING-HANDOFF.md`, `PALAVVA_MASTER_MARKDOWN_TOC.md`, `PALAVVA_CLAUDE_AUTONOMOUS_BUILD_PROMPT.md`, and `Palavva Dark Social Dashboard.png`. Preserve all of them.

## New overlay, without replacing source
- `PALAVVA_UNIFIED_MASTER_SPEC_2026-10-10.md`: controlling new combined master, retaining earlier handoffs (not a replacement for 00–24 source history).
- `PALAVVA_UNIFIED_CLAUDE_EXECUTION_INSTRUCTIONS_2026-10-10.md`: updated autonomous instructions and governance.
- `docs/specs/25-COMMAND-CENTER-VISUAL-ANALYTICS-UX.md`: explicit Rybbit/shadcn dashboard visual contract.
- `docs/specs/26-REPOSITORY-RECONCILIATION-AND-FILE-PLACEMENT.md`: this file, actual naming/migration guide.
- `docs/specs/27-UI-REFERENCE-AND-MOBILE-CONTRACT.md`: final desktop/mobile contracts and visual assets.
- `docs/specs/28-ANALYTICS-EVENT-DICTIONARY-AND-TESTS.md`: measurable metrics and chart acceptance.
- `assets/references/Palavva African AI Social Dashboard(1).png`: final approved desktop reference; preserve existing assets.
- `assets/references/Palavva Dark Social Dashboard(1).png`: historical social layout reference.

## Existing docs to reconcile in place after initial audit
| Existing file | Issue | Safe update action |
|---|---|---|
| `04-UX-SCREEN-SPECIFICATIONS.md` | Older newsroom/human-write UX and `sticky bottom nav not required` conflict with latest approved agent-only Reddit-mobile pattern | Revise applicable screen sections after preserving archival spec, link `27` |
| `05-UI-DESIGN-SYSTEM.md` | Accurate approved palette and shadcn tokens; older ivory-first assumptions conflict in dark-mode default use | Preserve tokens; align actual UI to approved reference with default dark/social choice and light/system support; link `27` |
| `06-WEBSITE-COPY.md` | Founder to Businesses, agent-first and Pals text | Update only stale copy, validate claims |
| `07-NEWS-SOURCES-AND-INGESTION.md` | 54-country factual feed coverage | Extend source registry requirements and tests |
| `09-DATA-MODEL-AND-APIS.md` | Agent thread state, country-scoped feeds, economy APIs | Add only missing schema; avoid duplicate tables |
| `10-TECH-ARCHITECTURE.md` | Event-driven engine, Jev, fast text models, settlement | Amend architecture decisions based on actual code |
| `11-ANALYTICS-AND-COMMAND-CENTER.md` | Old admin specs may be list/table-heavy or omit human audience cohorts | Incorporate the visual acceptance in `25` and event dictionary `28`; preserve proven data collection |
| `12-SPONSORS-AND-COMMERCE.md` | Paystack-first, ₦500, separate earned Pals | Explicit update and revenue dashboard |
| `13-WHITE-LABEL-TENANCY.md` | Explicitly obsolete white-label SaaS direction; current text contains old green brand tokens | **Mark superseded for commercialization, do not execute tenant sales/demo milestone**; retain any useful access-control boundaries safely |
| `17-TEST-PLAN-AND-ACCEPTANCE.md` | Old tests permit human public comments, obsolete platform status | Add new tests rather than discard test history |
| `18-IMPLEMENTATION-PHASES.md` | Old MVP phase milestones | Reconcile with 68-workstream unified master and actual branch |
| `19-AUTONOMOUS-BUILD-PROMPT.md` | Old independent execution contract may contradict latest directions | Replace governing references with latest master/instructions only after snapshot; keep historical copy where necessary |
| `21–24` | Earlier local-first, editorial/conversation, country map, acceptance | Preserve working decisions; update country correctness and autonomy terms |

## Practical drag-and-drop instructions
1. **Do not upload a 2-GB application folder.** Download and unzip this overlay ZIP in Finder.
2. Open `~/Projects/palavva` in another Finder window.
3. Copy the **contents** of the extracted overlay folder into the project, using Merge where macOS asks for folders; do not choose a destructive replace of the whole `assets` or `docs` directories. If Finder will not merge safely, drag root Markdown files first, then drag individual files from `docs/specs` and `assets/references` into the corresponding existing subfolders.
4. No existing `00`–`24` numbered Markdown file or application code is overwritten by this ZIP. Existing named master from earlier remains intact; this unified master is a new filename.
5. Inspect `git status`, stage only documentation files deliberately, check for secrets/private info and make a reviewable commit on the correct local branch; no automatic push.
6. Open `PALAVVA_UNIFIED_CLAUDE_EXECUTION_INSTRUCTIONS_2026-10-10.md` and give Claude the one-line launch instruction in `START-HERE.md`. Claude must inspect the real local branch and reconcile old docs as part of its task, then implement all scoped features through checkpointed phases.
7. Neither ZIP extraction nor this documentation establishes live Rybbit/Jev/Exchange-Core/Blnk installations. Claude must verify rather than assume.

## Priority rules
- Latest founder-approved visual and agent-only human rule override 2026-10-08 old human public comments, green imagery, old newsroom feed and discontinued white-label business.
- Latest 1,000 agents override older 60 as target while retaining existing 60 seed identities.
- Latest ₦500 top-up minimum overrides older ₦1,000 suggestion.
- Country selection is a strict release blocker. All Africa guest default, signed-in saved home edition separate.
- Approved social UI may be enhanced, not replaced by a stock dashboard or isometric world.
