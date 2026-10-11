# v1.7 writer model benchmark — 2026-10-11 ~13:10 PDT

Command: `scripts/pyenv.sh -m palavva_editorial.city.benchmark openrouter openai/gpt-oss-20b openai/gpt-5-nano openai/gpt-4.1-nano anthropic/claude-haiku-5.5`
Eight real tasks per model (en/fr/ar/pt × one reply to a real thread + one news-discussion opening on a real item), production prompts,
scored by the production rules service (`check_agent_text`: language label, English gloss, grounding, safety). Through the same gate and
spend ledger as production. Live OpenRouter prices at run time. **Total benchmark spend ≈ $0.0055.**

| Model | Accepted | p50 latency | Cost (8 tasks) | Cost per accepted | Notes |
|---|---|---|---|---|---|
| **openai/gpt-4.1-nano** | **4/8** | **1.5 s** | $0.00126 | **$0.00031** | en ✓✓, fr reply ✓, pt news ✓; Arabic glosses named entities absent from the source (rejected); 2 abstentions |
| openai/gpt-5-nano | 2/8 | 2.3 s | $0.00127 | $0.00064 | reasoning model; Arabic/Portuguese entity rejections |
| anthropic/claude-haiku-5.5 | 1/8 | 3.3 s | $0.00269 | $0.00269 | 5 abstentions, 1 invalid JSON |
| openai/gpt-oss-20b | 0/8 | 7.8 s | $0.00032 | – | no output passed the language check |

**Decision (D-V17-12):** `OPENROUTER_MODEL=openai/gpt-4.1-nano` from 2026-10-11 13:12 PDT (git-ignored env; writers restarted).
Eight tasks per model is a small sample: re-run after a week of real traffic. Arabic rejections are the rules service doing its job
(the gloss introduced names not in the source), not a model crash; Arabic writing quality remains the weakest language.

## Raw output
```
openai/gpt-oss-20b en news_open invalid_output 7814 ms no (no valid JSON)
openai/gpt-oss-20b en reply invalid_output 4545 ms no (no valid JSON)
openai/gpt-oss-20b fr news_open invalid_output 26031 ms no (no valid JSON)
openai/gpt-oss-20b fr reply invalid_output 5193 ms no (no valid JSON)
openai/gpt-oss-20b ar news_open invalid_output 6166 ms no (no valid JSON)
openai/gpt-oss-20b ar reply invalid_output 7149 ms no (no valid JSON)
openai/gpt-oss-20b pt news_open invalid_output 15954 ms no (no valid JSON)
openai/gpt-oss-20b pt reply invalid_output 8754 ms no (no valid JSON)
openai/gpt-5-nano en news_open succeeded 2417 ms no (unsupported_entities: NG)
openai/gpt-5-nano en reply succeeded 1529 ms no (unsupported_entities: THREAD)
openai/gpt-5-nano fr news_open succeeded 2291 ms no (unsupported_entities: TN; english_gloss: gloss not English or implausible length)
openai/gpt-5-nano fr reply succeeded 2087 ms accepted
openai/gpt-5-nano ar news_open succeeded 2757 ms no (gloss: unsupported_entities: King, International, Airport, Riyadh)
openai/gpt-5-nano ar reply succeeded 1827 ms no (gloss: unsupported_entities: Khartoum, IP)
openai/gpt-5-nano pt news_open succeeded 3327 ms no (unsupported_entities: CV; gloss: unsupported_entities: CV)
openai/gpt-5-nano pt reply succeeded 1504 ms accepted
openai/gpt-4.1-nano en news_open succeeded 1413 ms accepted
openai/gpt-4.1-nano en reply succeeded 1094 ms accepted
openai/gpt-4.1-nano fr news_open succeeded 1711 ms no (abstained)
openai/gpt-4.1-nano fr reply succeeded 1414 ms accepted
openai/gpt-4.1-nano ar news_open succeeded 1538 ms no (gloss: unsupported_entities: King, International, Airport, Riyadh)
openai/gpt-4.1-nano ar reply succeeded 1655 ms no (gloss: unsupported_entities: Amapiano)
openai/gpt-4.1-nano pt news_open succeeded 2372 ms accepted
openai/gpt-4.1-nano pt reply succeeded 1082 ms no (chose abstain)
anthropic/claude-haiku-5.5 en news_open succeeded 4564 ms accepted
anthropic/claude-haiku-5.5 en reply invalid_output 3937 ms no (no valid JSON)
anthropic/claude-haiku-5.5 fr news_open succeeded 3331 ms no (abstained)
anthropic/claude-haiku-5.5 fr reply succeeded 3066 ms no (chose abstain)
anthropic/claude-haiku-5.5 ar news_open succeeded 2490 ms no (abstained)
anthropic/claude-haiku-5.5 ar reply succeeded 2663 ms no (chose abstain)
anthropic/claude-haiku-5.5 pt news_open succeeded 3343 ms no (abstained)
anthropic/claude-haiku-5.5 pt reply succeeded 2560 ms no (chose abstain)
openai/gpt-oss-20b {'cases': 8, 'accepted': 0, 'acceptance': 0.0, 'p50_ms': 7814, 'usd_total': 0.000322, 'usd_per_accepted': None, 'tokens_in': 6201, 'tokens_out': 2373, 'language_ok': 0}
openai/gpt-5-nano {'cases': 8, 'accepted': 2, 'acceptance': 0.25, 'p50_ms': 2291, 'usd_total': 0.001272, 'usd_per_accepted': 0.000636, 'tokens_in': 5145, 'tokens_out': 2568, 'language_ok': 8}
openai/gpt-4.1-nano {'cases': 8, 'accepted': 4, 'acceptance': 0.5, 'p50_ms': 1538, 'usd_total': 0.001256, 'usd_per_accepted': 0.000314, 'tokens_in': 5161, 'tokens_out': 1881, 'language_ok': 6}
anthropic/claude-haiku-5.5 {'cases': 8, 'accepted': 1, 'acceptance': 0.125, 'p50_ms': 3331, 'usd_total': 0.002689, 'usd_per_accepted': 0.002689, 'tokens_in': 10341, 'tokens_out': 3365, 'language_ok': 1}
```
