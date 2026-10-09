# 12. Sponsors, Revive, EspoCRM and business discovery

## Founder-settled commercial boundary

**Reuse existing deployed Revive Adserver and EspoCRM on the separate Hetzner VPS. Do not create a new ad exchange, ad server, custom CRM or campaign management dashboard.** Health of both existing services and their exact supported API versions remains unverified until the agent inspects them. Avoid modifications to unrelated Hetzner workloads. Invoice Ninja is optional later, not installed/required for MVP.

## Advertiser journey

1. Visitor visits `/advertise` and reads truthful, small-business-friendly options, sponsor independence guarantee and inquiry policy.
2. Completes form: contact name, work email, organization, country, industry, optional budget and campaign goal, consent; bot/rate limits active.
3. API validates and saves **durable encrypted or appropriately secured local inquiry** with `PENDING_FORWARD`, returns reference only after persistence.
4. Bridge sends permitted fields to existing EspoCRM via approved authenticated API with idempotent external correlation key and retry queue; log integration status, not secrets. If unavailable, safe manual admin workflow remains possible.
5. Human approves business legitimacy, claims, creative rights, category/age restrictions, placement geography, disclosure and dates. No political/disinformation sponsor bypass.
6. Admin sets approved campaign, zones, targeting, creative, dates and reports in **Revive** itself. Palavva only maps known zone IDs to preapproved on-page slots.
7. Palavva renders `Sponsored` directly and persistently on sponsored slot / business content and optionally `About this placement` link. Sponsor cannot edit AI scripts or independent editorial decisions.
8. Revive remains primary source for impression/click reporting. Real financial transactions tracked later in external billing systems; do not fabricate revenue.

## Placement inventory [implementation default]

| Placement key | Where | Rendering rules |
| --- | --- | --- |
| `feed_inline` | After first 3–5 real feed stories | Inline, unmistakable `Sponsored`, frequency cap, not dominating fold |
| `home_rail` | Desktop utility rail | Responsive hidden/relocated on mobile, lazy loaded |
| `country_hub` | Country page | Relevant country match, opt-in sponsor rule, labeled |
| `topic_hub` | Topic/industry page | Industry relevance, claim review, labeled |
| `spotlight_paid` | Founder/business discovery | Distinct `Sponsored Spotlight`, separate from editorial spotlight |
| `newsletter` | Future digest | Not active until permissioned newsletter exists |

Never place interactive ad overlays over source citations, correction notices, comments or critical navigation. Avoid personal/sensitive topic ad targeting unless consent and applicable law permit. Design to render no ad rather than false sponsor when Revive is unreachable.

## Revive integration

Verify Revive host health/version, allowed origin/CSP, asynchronous JS zone invocation supported, ad-blocker fallback and privacy/cookie behavior. Default prefer **asynchronous JS zone tags** where compatible, as documented by Revive; lazy-load after public article content, enforce client-side CSP allowances narrowly and safe HTTPS. Store allowlisted Revive account/site/zone IDs server-side, no advertiser-specific script injection without review. Avoid prefetching ad response into SEO cached article pages if it would cause incorrect audience counting. Reconcile Revive metrics using official tools/API/admin report access, not imagined `GET /reports` endpoints; if API not available provide secure deep link and show `metrics unavailable` rather than invented numbers.

Official documentation: https://revive-adserver.atlassian.net/wiki/spaces/DOCS/pages/721005

## EspoCRM integration

Agent inspects existing version, API auth methods and entity fields with permission. Use server-only key, network policies, narrow `Lead` or appropriate entity write, custom `Palavva Inquiry ID`, duplicate matching that doesn't merge distinct businesses accidentally, consent metadata and retry/dead-letter. Do not expose existing CRM records to public site. On failures, encrypted at rest or access-restricted local fallback and `forward_state` retried. Manual view/download requires authorized admin and audit, redacted logs. No CRM request on public feed read path.

## Commercial ethics

- `Sponsored` labeling is permanent on paid story/card/profile surfaces and share previews where relevant. `Editorial Spotlight` must be selected independently and never compensated secretly.
- Advertising doesn't entitle advertiser to positive AI commentary, privileged moderation or editorial veto.
- Verify product, organization, creative license, misleading claims, restricted claims, privacy compliance and relevant country advertising rules before activation.
- Reject fake testimonials, bots deployed to promote sponsor threads, hidden native ad copy and fabricated endorsement metrics.
- Organization representatives can respond to a discussion only as **disclosed company representatives** under moderation, not as independent experts.

## Business profile contract

`Business` profile includes verified organization display name, country/location at safe granularity, sector, explanation of genuine product, official website, independently validated company identity when feasible, rights-approved media, owner-controlled updates and transparent last review. Profiles do not automatically receive editorial article ranking. Featured editorial pieces document research separately from organization submissions. No self-verified `Verified` checkmark.

## Initial price hypotheses (not public rates)

Founder discussed Premium $3–$5/mo, intelligence $49–$199/mo, data API $99–$499/mo, sponsor campaign $250–$2,000, newsletter sponsor $100–$1,000, white-label cadence monthly/quarterly/semiannual/annual. **These are test hypotheses, not live offers or proven monetization.** No payment processor integration required for MVP. If later invoices use Invoice Ninja, audit edition/license/branding and install/host fit first.

## Acceptance

Valid inquiry saves and has stable reference; EspoCRM success links to exact lead or accurately shows pending; duplicate retry never creates two leads. Invalid input rejected. Revive slot displays only if real zone configured and creative approved, with `Sponsored` label in desktop/mobile; missing zone leaves normal page intact. Sponsor administration does not alter editorial prompts or source ratings. Unrelated Hetzner containers remain untouched.
