# Palavva v1.3 | Apply AI-First + Locale + Trending + Local Pulse Update

## Purpose

This is a **targeted update to the existing Mac-local codebase**, not a new project or a complete replacement of the October 8 handoff. The user-provided October 9 handoff is included unchanged in this update for archival completeness. **No change has been made directly to the Mac or Oracle by the creation of these documents.**

## Place files in

`/Users/amaeteumanah/Projects/palavva`

Extract the ZIP and copy the listed files **into the root of the existing Palavva project**, not into a new nested `palavva-update-v1.3` directory:

- `19-AUTONOMOUS-BUILD-PROMPT.md`: **replace** the prior v1.2 `19` after optionally saving a backup; this is now the unified authoritative mission.
- `22-AI-FIRST-CONVERSATION-ENGINE.md`: add.
- `23-LOCALE-TRENDING-LOCAL-PULSE-IMPLEMENTATION.md`: add.
- `24-EXTENDED-ACCEPTANCE-MATRIX.md`: add.
- `PALAVVA_LOCALE_TRENDING_LOCAL_PULSE_HANDOFF_2026-10-09.md`: same supplemental handoff already placed in the project by the founder; **do not unnecessarily replace or overwrite an edited local version**.
- `README-UPDATE-V1.3.md`: reference only.

Keep existing `00-PROJECT-HANDOFF.md`, `01`–`18`, `20`, `21`, source code, local database, secrets, and all user modifications intact.

## Run Claude Code

From the existing Claude account/profile terminal:

```bash
cd /Users/amaeteumanah/Projects/palavva
claude-amaete-gmail --dangerously-skip-permissions
```

Then paste:

> Read `19-AUTONOMOUS-BUILD-PROMPT.md` completely and execute it now, together with `PALAVVA_LOCALE_TRENDING_LOCAL_PULSE_HANDOFF_2026-10-09.md`, the October 8 handoff, `21-LOCAL-FIRST-DEVELOPMENT.md` and the new `22`–`24` technical/testing addenda. This is a continuation of the existing working local Palavva build, not a restart. Start by inspecting current Git changes, code, running localhost app, overnight report and backups. Implement autonomous nested AI-agent conversations and the multilingual/trending/Local Pulse additions; automatically publish only low-risk verified threads; observe real realtime events. Run 79 acceptance scenarios, report actual evidence, make tested local commits, work autonomously past noncritical blockers, and DO NOT inspect or deploy to Oracle, modify Hetzner or spend money. Begin implementation immediately.

The `--dangerously-skip-permissions` switch bypasses Claude Code's built-in routine prompts but **does not grant authorization** for destructive changes, paid services, external production changes or any Oracle access.

## Source of truth and status

The user previously reported the app locally at `http://127.0.0.1:3000` with an overnight report listing 42 acceptance scenarios (29 passed, 4 locally passed with external blockers, 8 partial and 1 blocked). These were **reported by Claude**, not independently verified here. v1.3 app work is **not implemented by this package**. Actual running-app state must be inspected by Claude on the Mac before it changes anything.

The v1.3 extra matrix adds 12 conversation tests and 25 locale/geography/trending tests to the original 42, totaling **79 planned scenarios**, not 79 passing results.
