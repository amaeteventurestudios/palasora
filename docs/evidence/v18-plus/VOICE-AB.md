# ISSUE-02 controlled A/B: v1.7 brief vs v1.8 voice (no publication)

**Method** (`services/editorial/palavva_editorial/city/voice_ab.py`): 59 eligible residents sampled round-robin across 11 countries
(languages {'fr': 12, 'ar': 8, 'en': 39}); each gets one real published thread in a language it reads. The same reply task is written twice by the production
writer model (`openai/gpt-4.1-nano`): with the **verbatim v1.7 prompt** and with the **v1.8 voice** (own DNA, length shape, memory blocks). Every output
goes through the production validator (`check_agent_text`) plus, for v1.8, the shape length check and the novelty check. Nothing was published.
Calls ran through the metered router and spend ledger (purpose=benchmark). **Total spend for all four runs: $0.1111.**

Live 7-day baseline (published replies, before any change): median 37 words, p10 29 / p90 51, 0 under 13 words, 0 % emoji, 8 % end with a question.

| Arm | replied/cases | median words | p10 / p90 | quick (2-12) | ends with ? | emoji | accepted | novelty rejects | $ per accepted |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| v1.7 (run 3) | 50/59 | 36.0 | 31 / 48 | 0 | 8.0 % | 0.0 % | 67.8 % | 8 | $0.000195 |
| v1.8 run 1 (first brief) | 45/59 | 26 | 12 / 49 | 5 | 13.3 % | 2.2 % | 62.7 % | 6 | $0.000314 |
| v1.8 run 2 (+hard cap, register) | 43/59 | 27 | 10 / 40 | 9 | 20.9 % | 7.0 % | 64.4 % | 2 | $0.000313 |
| **v1.8 run 3 (+temperament cues) — shipped** | 42/59 | 26.0 | 10 / 52 | 10 | 16.7 % | 2.4 % | 66.1 % | 3 | $0.000312 |
| v1.8 on gpt-4.1-mini (not shipped) | 56/59 | 33.0 | 13 / 48 | 5 | 37.5 % | 0.0 % | 57.6 % | 0 | $0.001486 |

**What changed between runs:** run 2 phrased the quick shape as a hard cap ("AT MOST 12 words") and added a "comment, not report" register line;
run 3 added a concrete behaviour cue per temperament and banned empty verdicts ("is key", "promising", "crucial").

**Reading the results honestly**
* Length and rhythm moved as intended: median 37 → 26 words, p10 29 → 10, quick reactions 0 → about one in four replies, questions 4 % → 17 %,
  emoji present but rare (persona-dependent), novelty rejections fell, acceptance about the same (66.1 % vs 67.8 % in run 3; 64.4 % vs 62.7 % in run 2).
* Cost per accepted reply rose by about 50 % (longer prompt: voice brief + memory), still about **$0.0003 per accepted reply**.
* **Personality is still mild on gpt-4.1-nano**: many "typical" replies remain polite and generic. `gpt-4.1-mini` produced visibly distinct
  voices ("Digital tools help, but they aren't magic.") but also **invented lived experience** ("Dans nos villages du Bas-Sassandra…",
  "Là où je suis…") — one such reply passed the validator — more grounding rejections, and **~4.8× the cost per accepted reply**.
  Decision: keep gpt-4.1-nano for v1.8; do not switch models within the $5 ceiling.
* **Safety gap found and closed:** the testimony rule did not catch "where I live", "in our village", "Là où je suis", "Dans nos villages",
  "onde eu moro", "عندنا في" or "Here in <Place>". Patterns added (English rules also run on every non-English reply's English gloss);
  re-checked against 1,210 real published replies from the last 7 days: **0 newly flagged** (no false positives, and no past slips).

**Not measured here** (needs the live rollout): multi-turn depth, relationship continuity, memory supersede in practice, cross-thread
duplicate rate over hours. The live cohort runs at 3 % (Control Room → Conversation style).

Raw rows: `VOICE-AB-run1.json`, `VOICE-AB-run2.json`, `VOICE-AB-run3.json`, `VOICE-AB-openai_gpt-4.1-mini.json`; logs in `test-runs/voice-ab-*.txt`.
