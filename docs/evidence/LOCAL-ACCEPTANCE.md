# Local Mac acceptance evidence

**Mac:** x86_64 i7-6700K, macOS 12.7.6, 32 GB. **URL:** http://127.0.0.1:3000 (Command Center `/admin`; sample tenant http://sample.localhost:3000). **Oracle private stage approval:** NOT REQUESTED → **requested now** (see `APPROVAL-GATES.md`). **Public launch approval:** NOT REQUESTED.

## Results

The full matrix is in `TEST-MATRIX.md`: **29 PASS**, **4 PASS (local) with the external half BLOCKED** (T-001 Oracle, T-030 EspoCRM, T-037 off-host, T-038 Oracle scan), **8 PARTIAL** (T-009, T-012, T-023, T-026, T-028, T-032, T-040, T-042), **1 BLOCKED** (T-031 Revive; local fallback works), **0 FAIL**. Automated suites at the final run: typecheck clean, vitest 17/17, pytest 39 passed + 3 opt-in skipped (real-Qwen 4/4 run separately), Playwright 32/32 (incl. axe in both themes, tenant isolation, outage).

## Real vs fixture content (be clear about what you see)

| On screen | Real or fixture |
| --- | --- |
| Six homepage stories with a gold **Demo content** badge | **Fictional fixtures**, `is_demo=true`, `noindex`, sources at `example.invalid` |
| Sample Africa Community tenant | **Demonstration tenant**, not a customer |
| Editorial Queue: "Mandela Bay starts R33.3m housing build…", "South Africa Surpasses Industrial and Procurement Investment Targets…" | **Real** SAnews.gov.za items drafted by **real Qwen**; **unpublished**, waiting for you |
| AI runs in AI Operations (provider `ollama`) | **Real** calls with measured latency and tokens; `fixture` rows are labeled |
| Analytics numbers | Real first-party events from local browsing/tests (the dev dataset is mostly empty until you browse with consent) |

## Founder checklist (about 20 minutes)

1. `scripts/status.sh`. Everything should be 200 with the policy gates false.
2. Open http://127.0.0.1:3000 on desktop and phone width: masthead, chips, tabs, first story above the fold, dark mode via the monitor icon.
3. Open a demo story, click **Post comment** while signed out, sign in as `reader@palavva.local`, and confirm the draft is restored, then post.
4. Click WhatsApp/X/Copy link. Check the share card: `/og/demo-cold-storage-coop-tomatoes`.
5. Sign in as `editor@palavva.local` → `/admin/editorial` → open the **Mandela Bay** draft. Compare claims with the SAnews excerpt, then approve (with a note), edit or reject. *This is the first real publication; it is your decision.*
6. Publish a correction on it and see `/corrections` and the banner.
7. `/admin/sources`: read the SAnews rights notes; try **Test fetch** on a pending source ("no network request was made").
8. `/advertise`: send an inquiry, then see it in `/admin/sponsors` as `NOT_CONFIGURED` (honest; no CRM call).
9. Visit http://sample.localhost:3000 (sign in as `admin@sample.local`) and confirm none of Palavva's content, sources or users appear.
10. `/admin/ai` → Pause AI; `/admin/settings` → Publishing paused; watch approvals get blocked; turn both off.
11. `scripts/backup.sh && scripts/restore-drill.sh`.

## Measurements

See `phase5/load-test*.txt`, `phase5/compose-smoke.txt`, `phase2-real-qwen-tests.txt`, `PHASE-2-RESULT.md`. Qwen: 12–36 s per call over the DERP relay, 74 real calls overnight, no failures or timeouts.

## Hard launch blockers

Legal Terms/Privacy text; rights confirmation for every source; ARM64 verification on Oracle; off-host backups; SSRF DNS-pinning (ADR-012); live EspoCRM/Revive validation; manual screen-reader pass; a human editorial QA panel on 30+ evaluation packets (`08`), which has not been done.
