# Approval gates and the Phase 6 proposal

Nothing below has been done. Each item needs an explicit founder decision.

| # | Decision needed | Why | What I would do once approved | Rollback |
| --- | --- | --- | --- | --- |
| 1 | **Confirm SAnews.gov.za rights** for Palavva's intended use | Agent-approved from the published policy for local dev only | Keep or revoke it in Sources; record the founder as verifier | Revoke button (clears excerpts, holds drafts) |
| 2 | **Review the 2 real Qwen drafts** in the Editorial Queue | Policy: the agent must not approve its own AI drafts of real news | Nothing; you approve, edit or reject in the UI | Retract or correct |
| 3 | Install `docker buildx` + QEMU on this Mac (Colima) | Needed to build/verify **linux/arm64** images for Oracle | `brew install docker-buildx`, `colima` with binfmt; build multi-arch | Uninstall plugin |
| 4 | Off-host backup destination | T-037 requires off-host copies | Encrypted `restic`/`rclone` to an approved bucket or disk | Delete remote repo |
| 5 | EspoCRM / Revive credentials (read-only first) | T-030/T-031 live integration is BLOCKED | Health check, then idempotent Lead create; map one approved zone | Remove env vars |
| 6 | Legal: Terms, Privacy, analytics consent text | Launch blockers per `06` | Publish counsel-approved text | Revert page |
| 7 | **Phase 6: Oracle private staging** | Separate gate per `21` | See the proposal below | See below |
| 8 | Phase 7: public DNS/HTTPS launch | Separate gate after Phase 6 | Caddy + DNS + 80/443 ingress | Remove DNS records |

## Phase 6 proposal (for approval; not started)

1. Read-only Oracle inventory: OS/arch, disk, RAM, Docker/Compose versions, listening ports, firewall/NSG, Tailscale status. Write it to `docs/evidence/PHASE-6-PREFLIGHT.md`.
2. Build multi-arch images on the Mac (requires gate 3) and transfer them by an approved route (`docker save | ssh docker load`, or an approved private registry).
3. Deploy `palavva_stage` Compose with **web bound to 127.0.0.1 only**, reached through an SSH tunnel or Tailscale Serve (no public ports), and fresh secrets on the host (never copied from the Mac's `.env.local`).
4. Run migrations on an empty volume, seed the reference data, re-run `scripts/test-all.sh` against staging (E2E through the tunnel), the restore drill and a Qwen latency check from Oracle → iMac.
5. Report the differences from Mac measurements. **Rollback:** `docker compose down`, remove the volumes and staging directory; Oracle returns to its prior state (snapshot first).
