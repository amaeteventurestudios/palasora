# Deployment state (as of 2026-10-09 16:20 PT, end of v1.3.1 Mac-local work)

```
ORACLE_DEPLOYMENT_AUTHORIZED=false
PUBLIC_LAUNCH_AUTHORIZED=false
PAID_FALLBACKS_ENABLED=false
```

**Where Palavva runs:** only on the founder's Mac, natively, loopback-only. Bindings were verified with `lsof` at the end of v1.3.

| Service | Bind | Process | Data |
| --- | --- | --- | --- |
| Next.js web/BFF (production build, incl. SSE `/api/v1/events`) | 127.0.0.1:3000 | `scripts/dev-up.sh --prod` | n/a |
| PocketBase 0.40.5 (migrations through `1760300000_v131_engagement`) | 127.0.0.1:8190 | native binary | `data/pb_data` |
| Editorial API (FastAPI) | 127.0.0.1:8100 | uvicorn | `data/jobs.db`, `data/search.db` |
| Editorial worker (ingest, draft, converse, translate) | no port | python (single instance, flock on `data/run/worker.lock`) | queue, analytics |
| E2E test stack (only while tests run) | 127.0.0.1:3300 / 8390 / 8400 | `scripts/test-stack.sh` (now also runs a fixture worker) | `data-test/` |

## Outbound connections made by Palavva

All are fetched through the SSRF-safe fetcher, which is now pinned to the validated IP (D-15):
- `https://www.sanews.gov.za/rss.xml`;
- four Global Voices feeds (Nigeria EN, Sub-Saharan Africa EN, French, Arabic; CC BY 3.0);
- `http://100.70.149.32:11434`: Qwen `qwen3.5:4b` over private Tailscale. Concurrency 1; budgets: model 250 requests/day, conversation replies 150/day.

No other external services. The maps are static local SVG data, with no tile servers.

## Publication policy in force (local)

- **Automatic publication:** risk-tiered, for LOW-risk and fully evidenced topics only (`AUTO_PUBLISH_DISABLED=false` in `.env.local`, tenant switch off; D-01, D-02).
- **Everything else** waits in the exception queue.
- **Rate cap:** 6 topics per hour.
- **Kill switches:**
  - env `AUTO_PUBLISH_DISABLED`;
  - tenant switch;
  - `PUBLISHING_PAUSED`;
  - `AI_PAUSED`;
  - `INGEST_PAUSED`;
  - per-thread pause and unpublish.

**Dev data at handoff (v1.3.1):**

| Item | Count |
| --- | --- |
| Real topics | 26 |
| Auto-published and live | 8 (2 of them via the automatic rate-cap retry) |
| Withdrawn by an editor, with correction | 2 |
| Awaiting review (sensitive or uncertain) | 16 |
| AI replies on real topics | 33 |
| French translations: machine (unreviewed) / failed | 17 / 0 |
| Arabic translations: machine (unreviewed) / failed | 12 / 5 (held for native review) |
| Human reads / shares recorded | 0 / 0 (no real people have browsed); 2 automated reads refused |
| Demo items | labelled; excluded from trends and sitemap |

## Not touched

- Oracle: `palavva-prod`, `palavva-vnic`, the `~/.ssh/palavva_oracle` key (never read), OCI.
- Hetzner: Revive and EspoCRM.
- DNS, registrar, Tailscale ACLs.
- Simeon's iMac and Ollama configuration (only used for inference).
- Unrelated local apps: PocketBase on 8090, Next on 3100, the AVS Foundry container.

## Containers

Rebuilt for v1.3.1 (`palavva_local-*` images on Colima, linux/amd64). `scripts/compose-smoke.sh` ran the stack on 127.0.0.1:3400 with the fixture model and ingestion paused: 18/18 checks passed, only web was published (loopback), and everything was removed afterwards (`down -v`). No registry push. ARM64 not built.

## Source control

`origin` = `https://github.com/amaeteventurestudios/palavva.git` (`main`, never force-pushed). `.env.local`, `.env.test`, `.env.compose`, `data/`, `data-test/` and `backups/` are gitignored and were never pushed.

## Source approvals

| Source | Status |
| --- | --- |
| SAnews.gov.za | `approved` (provisional, local dev) |
| Global Voices (4 feeds) | `approved` under CC BY 3.0 with attribution (`sources/GLOBAL-VOICES-RIGHTS-REVIEW.md`) |
| 7 other candidates | `pending` / disabled |

## Backups

Local only; no off-host destination approved.
- Newest: `backups/palavva-20261009T221255Z.tar.gz` (taken before the v1.3.1 schema change; sha256 `365faf5e…e83c`).
- Rollback drill: passed 2026-10-09 (code `043fe79` + that backup), see `docs/evidence/v131/rollback-drill.txt`.
- Restore drill: passed 2026-10-09, see `docs/evidence/restore-drill-v13-20261009.txt`.
- Pre-v1.3 safety backup: `backups/palavva-20261009T163013Z.tar.gz`.
