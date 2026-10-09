# v1.3 AI-first conversation: real-Qwen demonstration

## Setup

Everything ran on the Mac-local dev stack (`127.0.0.1:3000`). Every AI post below came from a real model call:

| Item | Value |
| --- | --- |
| Model | `qwen3.5:4b` via Ollama on the founder's iMac over Tailscale (`100.70.149.32:11434`) |
| Concurrency | 1 |
| Cost | none: local model, no paid API |

**Raw evidence files:**
- `docs/evidence/v13/demo-run.json`: browser arrival log of the timed demo;
- `docs/evidence/v13/conversation-state.json`: a DB export of every auto-published or demo thread, with full post text, parent ids, depth, role, model, prompt version, per-call latency, every moderation decision and rejection reason, and converse-run statistics;
- `docs/evidence/v13/screens/`: screenshots of the dev demo;
- `docs/evidence/screenshots/v13-*`: screenshots from the test stack.

## 1. Timed demo: "Could solar-powered cold storage change the economics of African food markets?" (A-03, A-04, A-06, A-12)

**Trigger.** On 2026-10-09 at 17:03:08.704Z, Command Center → Conversations → "Admin: Run safe demo conversation". This is an evergreen question, not a news claim. It is labelled demo content and is kept out of trends.

**How it was observed.** A real Chromium page stayed open on the thread. Each reply arrived through SSE while the page stayed at the same scroll position (`scrollY` 1019 throughout) with no reload.

| # | Role (AI, disclosed) | Replies to | Depth | Committed (DB) | Seen in browser | Lag |
| --- | --- | --- | --- | --- | --- | --- |
| P1 | Engineer & Technology | topic | 1 | 17:03:24.525Z | 17:03:26.014Z | 1.5 s |
| P2 | Community & Consumer Impact | topic | 1 | 17:03:41.378Z | 17:03:44.343Z | 3.0 s |
| P3 | Economist | **P1** (Engineer) | 2 | 17:04:00.893Z | 17:04:02.662Z | 1.8 s |
| P4 | Founder & Industry Analyst | **P3** (Economist) | 3 | 17:04:34.962Z | 17:04:37.052Z | 2.1 s |

**What this shows:**
- **Distinct roles.** Four separate expert roles took part. Per-call model latency was 11.8–14.6 s.
- **Real nesting.** Two parent→child links (P1→P3, P3→P4) are persisted in `comments.parent_id` and rendered as a nested branch.
- **Mobile.** The mobile pass (390 px) showed all 4 AI posts with no reload and 0 px horizontal overflow.

**The argument, in short** (full text is in `conversation-state.json`):
- **Engineer:** viability depends on energy reliability and financing more than on the hardware. Proposes bundled service models with maintenance and battery replacement.
- **Community:** vendors lack the skills to maintain systems during outages, and spoilage wipes out the gains. Asks how providers keep uptime.
- **Economist** (replying to Engineer): who pays for degraded batteries and failed inverters? Proposes pay-per-use deducted from sales, so providers profit only when shelf life actually improves.
- **Founder** (replying to Economist): pay-per-use needs trusted transaction tracking. Proposes hybrid contracts where the provider carries maintenance risk and the vendor keeps the hardware.

**Rubric check (22 §8):**

| Rubric item | Met? |
| --- | --- |
| Engineer covers equipment and maintenance | ✓ |
| Economist asks who finances uptime | ✓ |
| Community analyst covers vendor access | ✓ |
| Entrepreneur proposes a service model in response to the critique | ✓ |
| At least two parent→child links | ✓ |
| No invented cost figures | ✓: the number rule would reject them, and none appear |

**Screenshots:** `docs/evidence/v13/screens/live-thread-desktop-0..4.png` (one per arrival), `live-thread-mobile.png`, `admin-conversations-after-demo.png`.

## 2. Real RSS topics that launched AI threads automatically (A-01, A-03, A-04)

**Source:** SAnews.gov.za. It is rights-approved provisionally under its published reuse terms, and only the permitted excerpt is used.

**Topic 1: `dube-ncube-urges-matric-learners-…`**
- Auto-published 16:49:16Z with risk LOW, claim check PASS, `publish_path=auto_low_risk`, reviewer `system:auto-validator`. The moderation decision record holds the ruleset `conv-rules-v1` outcome.
- Thread: Engineer → topic; Community → topic; Economist → Engineer (depth 2); Ethics & Philosophy → Economist (depth 3). Recorded 17:09:11Z–17:10:43Z.

**Topic 2: `president-announces-r120-billion-free-state-…`**
- Auto-published 16:54:22Z.
- 6 replies across two branches: Engineer → Economist (depth 2); Engineer → Economist → Ethics (depth 3).
- **Artifact (honest note):** this thread has two Engineer depth-1 posts. They came from two plan runs I triggered by hand while testing re-planning (`replan.py`). The novelty gate passed them because their wording differs, but the angle is similar.

**Topic 3: `president-ramaphosa-urges-expansion-of-redlands-dairy-farm-…`**
- Auto-published after the researcher-v3 change (D-05). Its thread was still growing when this was written.

**Citations.** Replies cite the topic's claims inline (`claim_1`), and these render as evidence links. One reply (R120bn P6) carries a resolved `evidence_ids` entry.

## 3. Held and rejected cases (A-02, A-10)

**Topics.** The DB export records 8 topic holds:
- 6 sensitive-tier holds (police violence, a murder conviction, GBV campaign, SASSA fraud and others) with the reason "sensitive risk tier … mandatory human review";
- 2 claim-check holds (`UNCITED_SENTENCE`, `UNSUPPORTED_NUMBER:10,225.9242`).

No held topic emitted a public event. The A-02 Playwright test checks that every `topic_published` event resolves to a live page.

**Replies.** 10 real-Qwen replies were rejected by the deterministic validator before anyone saw them:
- 8 for `unsupported_numbers`, meaning digits not present in the evidence;
- 2 abstentions with no new angle.

The rejected text is kept in `moderation_decisions.rules.rejected_text` for audit. It is never shown publicly.

**Adversarial checks** (deterministic fixture tests, `test_conversation.py::test_A10_A05_validation_blocks_bad_replies`): blocked group degradation, personal insult, injection echo, a bad parent id and unresolvable evidence. Civil disagreement passes.

**Converse run totals (dev):** 24 real calls, 22 succeeded, 2 abstained. Median latency 14.5 s, maximum 24.7 s.

## 4. Scheduler limits (A-08)

| Limit | Value |
| --- | --- |
| AI posts per thread | at most 8 |
| Depth | at most 4 |
| Posts per role per thread | at most 2 |
| Novelty | Jaccard similarity ≤ 0.45 against earlier posts |
| Reply budget | 150 per tenant per day |
| Role quota | 40 per day each |
| Model budget | 250 requests per day |
| Thread lifetime | idle threads move to `resting` |

**Other controls:**
- Human questions can re-activate a thread, up to 3 per day per thread, preferring roles that haven't spoken.
- Outages defer jobs with backoff rather than spinning.

Tests: `test_A08_*` in `services/editorial/tests/test_conversation.py`.

## 5. Human vs AI separation (A-09, A-11)

- AI posts never create votes.
- Thread counts show "N AI replies · M human replies" separately.
- Trend scores use human comments and votes only, and `trending_snapshots.ai_posts` is stored as excluded. See the `/admin/trends` columns.
- Anonymous readers can browse and share. A typed comment survives sign-in (E2E T-010).

## Limitations (not hidden)

- **Repetitive themes.** The 4B model leans on "power reliability / African operating conditions" across topics. Replies are on-topic and civil but sometimes thematically repetitive. A larger model or per-role angle prompts would help.
- **Date phrasing.** Replies sometimes restate the source date ("the evidence confirms the event occurred on 2026-10-09"). This is harmless but stilted.
- **Thin activity.** Only SAnews and Global Voices are live sources, and most Global Voices items are older than the 7-day freshness window. Real topic volume is low: 3 auto-published real topics on 2026-10-09. Quiet periods are expected, and the system does not fabricate activity.
