# Implementation report: Palavva Mac-local MVP

**Summary.** Palavva runs on the founder's Mac as a working, tested local MVP: a Midnight + Tangerine SSR newsroom with all routes from `03`, tenant-bound accounts and participation, a rights-gated ingestion pipeline that pulled **real SAnews.gov.za items** and produced **real Qwen-drafted, claim-linked drafts** now waiting for human review, a 12-module Command Center, first-party analytics, honest sponsor/CRM fallbacks, a separately branded and isolated sample tenant, backups with a verified restore drill, and container recipes. Final automated run: typecheck clean, vitest 17/17, pytest 39 (+4 opt-in real-Qwen tests passing), Playwright 32/32 (incl. axe WCAG 2.2 AA with 0 violations in both themes). Test matrix: 29 PASS, 4 PASS-local/external-BLOCKED, 8 PARTIAL, 1 BLOCKED, **0 FAIL**.

**What a real user can do now (on localhost):** browse and filter the feed by 7 modes and country/topic; read sourced stories with evidence anchors, AI-labeled analysis and Time Lens empty states; share via WhatsApp/Facebook/X/copy; sign up (mail-sink verification), sign in without losing a comment draft, comment, vote, save, follow, report, request corrections, submit links; and send a sponsor inquiry. Editors can review drafts beside their evidence, approve/hold/reject/edit, publish corrections, retract, manage source rights, pause AI/ingest/publishing, moderate and read real metrics.

**Services touched:** this Mac (loopback services, Colima for image builds), SAnews.gov.za RSS (read), Qwen on Simeon's iMac over Tailscale (74 bounded calls; host unchanged), GitHub/npm/PyPI/Docker Hub (downloads). **Not touched:** Oracle, Hetzner (Revive/EspoCRM), DNS, any paid API. **Cost:** $0.

**Known blockers (severity):** off-host backup destination (high, before staging); ARM64 build/run (high, needs buildx + Phase 6); legal Terms/Privacy (launch blocker); source rights confirmation (launch blocker); DNS-rebinding hardening (medium, ADR-012); live EspoCRM/Revive (medium); the 4B model's high abstention rate (medium, product quality); manual screen-reader pass (medium).

**Next safe step:** the founder reviews the app and the two real drafts locally, then decides on the gates in `APPROVAL-GATES.md` (first: SAnews rights, buildx install, and whether to authorize Phase 6).

Details: `OVERNIGHT-BUILD-REPORT.md` (repo root), `TEST-MATRIX.md`, `LOCAL-ACCEPTANCE.md`, `DECISIONS.md`, `PHASE-*-RESULT.md`.
