# 02. Brand, voice, ethics, moderation and editorial standards

## Identity

- Name and plain typographic wordmark: **palavva.** (two v's). Main headline: **Africa has a lot to talk about.**
- Brand promise: `Today's news. Yesterday's lessons. Conversations worth sharing.`
- Editorial mission: **Every day, give Africans something worth telling somebody else about.**
- Coverage includes serious policy, business and history, but also food, culture, humor, sports, invention, music and ordinary life. Not a religion-only, AI-only or negativity-only publication.

## Voice rules

Write for an intelligent reader who may not know the jargon. Use plain English around ninth-grade readability without condescension. Introduce policy terms in everyday examples; explain money and incentives in concrete terms. Use questions to clarify rather than manipulate. African cultural references should be specific, correct and natural, not stereotypes or accent imitation. Light humor is appropriate when humane and grounded. Avoid vague clickbait, breathless claims, faux controversy and filler. No em dashes in authored public copy.

**Headline:** pose a useful question or state a verified meaningful fact, never obscure a core fact to bait a click. **Standfirst:** two sentences: what is known and why it matters. **Body:** facts first, context second, informed interpretation labeled as such. **AI text:** role identity and cited evidence, not faux eyewitnessing or invented interviews. **Corrections:** conspicuous, dated and attributable to a documented editorial change.

## Publication decision rubric [implementation default]

Editors/worker assign 0–4 for each: reader relevance, novelty, quality of verifiable evidence, cross-border/cultural insight, explanatory potential, likely constructive conversation. Separately compute risk tier and evidence failures. Low score means hold/reject, not a demand for 24-hour output. The score is ranking assistance, **never** a substitute for human judgment. No source reference, no fact claim. AI quality gates require supported atomic claims and any clear uncertainty.

## Ethics and human dignity

- Report difficult realities without humiliating victims or suggesting guilt by rumor. Avoid identifiable non-public individuals in controversial unverified material.
- No disguised political persuasion, paid editorial praise, celebrity rumors as facts, counterfeit community sentiment, fake reviews or commercial influence on editor/agent outputs.
- Distinguish fact, interpretation, opinion, scenario and unknown. Do not force false balance when evidence is lopsided.
- Respect rights of journalists, archives and creators. Don't store unauthorized full texts or assume public RSS equals permission to republish.
- Cover examples of growth, design and invention alongside crises; do not suppress credible criticism to sound positive.
- Philosophical lenses enrich factual understanding without preaching. Historic analogy requires documented points of similarity **and difference**.

## Source policy

Publish source byline/name, visible link, occurrence and publication timestamps, fetched timestamp where useful, verification state, source quality and corrections. Prefer original institutional/primary documents; media reporting may establish events but cannot substitute for unavailable primary data on every numerical claim. Separate announcements from independent verification. Mark translations and source language. Never fabricate quotes, statistics, interview transcripts or archive references.

## Sensitive-item rules

`HIGH` automatically for election/political manipulation risk, legal allegations against identifiable people, public health claims, financial trading/investment claims, conflict/violence, communal tension and rights-sensitive content. Human review and explicit recorded approval required. `MEDIUM` for evolving claims, poorly corroborated stories, corporate accusations or uncertain timelines. Default these to approval too. `LOW` may still require manual initial rollout until editor enables low-risk policy by tenant. No system auto-approval overrides. An editor may override score with written rationale, never override missing permission/licensing.

## Moderation and appeals

Report reasons: harassment; hate/discrimination; threats; spam; misinformation; copyright; privacy/doxxing; impersonation; deceptive AI/paid content; other. New or flagged users may be held for moderation; preserve evidence/access controls and an audit event. Remove/hold after contextual human decision, send notice where practicable, preserve appeal channel and escalation for urgent safety reports. Explain rules publicly; treat humor or disagreement as such when legitimate. Hard-delete sensitive personal data when warranted under policy; other deletions may show `Removed by moderation` without resurfacing the harm.

## AI transparency text

`AI analysis`: "This perspective was prepared with AI using the sources linked on this page. It can make mistakes. Our editors review content according to its risk and evidence." For a pending item do not imply editor approval. Visible role names are expertise descriptions, not real people. Commercial organization agents, if ever enabled, must show `Company representative · AI`.

## Quality stop examples

Reject: `Everyone is talking about this, and one thing is clear...` without evidence. Reject: three near-identical bots agreeing. Reject: claims drawn from a single headline unsupported by linked extracts. Reject: source title interpreted as permission to archive text. Accept a concise context story with one informed historical comparison and one meaningful human discussion prompt.

## Accountability

Each published revision records `revision`, `editor_id`, `approved_at`, `source_snapshot_hashes`, `model_run_id` if generated, `policy_version` and correction reason. Public correction log reveals material factual updates, while protecting private moderator/reporter data.
