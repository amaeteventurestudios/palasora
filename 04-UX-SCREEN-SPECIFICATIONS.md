# 04. Complete responsive UX and screen-by-screen specifications

**State contract for every screen:** loading/skeleton, loaded, zero-results, error/retry, narrow viewport, keyboard navigation, signed-out state as appropriate. All primary controls are live links or working actions. CMS data takes precedence over demo content; demo fixtures are labeled and excluded from public SEO.

## Layout framework

- Desktop >= 1200 px: masthead, compact headline/filters, main content 8 columns + 4-column utility rail, maximum content width 1280–1360 px. Story reading column target 700–760 px.
- Tablet 768–1199 px: main feed 100%, secondary modules after main content or collapsible; no permanently squeezed 2-column feed.
- Mobile 320–767 px: single column, brand/search/menu, swipeable filters/tabs with visible focus; at least first card title visible without large hero. Sticky bottom nav **not required**.
- Maintain scroll on feed update; show `3 new conversations` toast and insert on click. Filtering updates URL and clears only the feed page cursor.

## Approved visual layout override, 2026-10-08: Midnight + Tangerine

This visual specification supersedes only the historic green styling in `00`. Implement **Midnight `#1B2030`**, **Tangerine `#E85E31`** (accessible darker `#C34218` for white-on-solid button text), **Warm Gold `#F8C45C`**, **Ivory `#F8F5F0`**. Details and semantic tokens: `05-UI-DESIGN-SYSTEM.md`. The public app is a **modern newsroom + community**, not an institutional directory or an admin dashboard. First story title and beginning of content must appear without scrolling at desktop 900px height and phone 844px height.

**Desktop visual structure:** (1) ~64–70px Midnight masthead with white `palavva` + Tangerine dot; (2) compact Ivory editorial statement plus active country/sector chips; (3) Tangerine-underlined feed tabs; (4) asymmetrical 8/4 editorial feed + discover rail, first feature distinguished typographically, rest compact and scannable; (5) measured, disclosed sponsors below editorial priority. Avoid full-screen city-image hero, forced marketing CTA, card-catalog sameness, oversized padding, fixed-height empty rails.

**Mobile visual structure:** ~56px Midnight header, compact headline, horizontal scroll filters, Tangerine selected tab, a substantive first story beginning before ~280px of the 844px viewport, next feed item visible before fold. No heavy autoplay/hero images. Respect reduced data and motion.

**Story view:** strong Midnight headline and source provenance, low-distraction Ivory reading column, careful Tangerine emphasis for actions, Gold only as a supplementary Time Lens detail, visible AI/human and editorial/paid role distinctions. **Admin:** Midnight sidebar + neutral cards, Tangerine selection/focus, never fabricated KPIs.

**Screen-level review:** Capture before/after at 320, 390, 768, 1024 and 1440. Reject screens if any old `#173C32`/`#F8DC9C` brand treatment survives, if category colors overpower brand, or if the first feed item is hidden below the fold.

## S01. Desktop homepage `/`

**Visual style:** Midnight masthead, Tangerine active feed tab/CTA, restrained Gold lens accents, Ivory body and purposeful asymmetric story card sizes. **Intent:** instantly see fresh worthwhile conversation. **Above fold:** 64 px masthead `palavva.` / Search / Explore / Account; 72–108 px headline band `Africa has a lot to talk about.` plus one sentence; compact country/topic rows; active feed tabs; first headline and lede. **Left/main:** feed item cards with headline, `Nigeria · Economy · 2h ago`, source/published info, 2-line summary, `Read · 4 human replies · Share · Time Lens`. **Right/utility:** actual new publications, trending topics, founder spotlight, optional clearly tagged Sponsored zone. No fake activity or inflated counts. **Interaction:** feed tabs are real routes, country and topic chips combine, cursor pagination, random selection uses only approved records. **States:** if nothing published, `We're gathering stories worth your time.` plus vetted editor selections when possible.

## S02. Mobile feed `/`

**Visual style:** dark Midnight top line with white wordmark/Tangerine dot; ivory low-data cards; colored accents do not create large empty regions. **Intent:** browse on constrained connections. **Stack:** compact 56 px masthead, single-line slogan, horizontal countries, topics, feed tabs and immediately visible 1-column feed cards. No horizontally clipped CTA, large autoplay video or blank hero. **Interactions:** search overlay, accessible filter drawer for full lists, saved-scroll/new-story notification, share sheet. **QA:** 320/375/390/428 px and network throttle; body scroll never sideways.

## S03. Discussion detail `/discussion/[slug]`

**Visual style:** editorial Midnight typography on Ivory, evidence on white cards, Orange used only for actions, Gold reserved for history context. **Header:** useful question, verified place/subject/time + `Updated` when applicable. **Body order:** `What happened?` 2–4 sentences, `Why it matters`, clickable original sources including byline/dates, clearly marked `AI analysis` with 1–3 relevant roles, optional context visual, `Time Lens`, human discussion. **Actions:** share always public; reply/vote/save login gated; report and correction request. **Trust:** render evidence as explicit list; show `Still developing` where facts unconfirmed; corrections visible; edited Palavva piece vs AI reply vs human clearly differentiated. **Mobile:** article first, side actions under title, source anchors readable.

## S04. Time Lens `/time-lens/[slug]` / Take Me Back

**Intent:** evidence-based past-vs-now understanding. **Elements:** selected era chips (1950s/1960s/1980s/1990s/2000s/Today); factual timeline cards with archive citations and source types; `What is similar` and `What is different` columns; `What we cannot confirm` disclosure; link back to original discussion. **Never** render a generated historical picture as real archival footage; image provenance required. **Empty:** `No verified archival material for this period yet.` **Interactions:** choose era, filter region, open primary evidence; no claim of historical equivalence solely by chronology.

## S05. Discover/search `/discover` `/search`

**Components:** search input, chips for country/industry/language/content type, editor-curated feature rails and relevant results list. Each result shows source or `Original Palavva research`, published/updated date and content label. **Behavior:** debounced query + server FTS, URL-persisted filters, accessible clear/reset; escape and injection safe. `No matches. Try another country or a broader term.` **Mobile:** sticky compact search/filter bar, no sidebar dependence.

## S06. Nigeria country hub `/country/nigeria`

**Hero:** concise `Nigeria`, 1-line description and filter by industry. **Sections:** latest verified conversations, explained policy, builder spotlight, historic context and clearly labeled sponsored slot if actually approved. **Avoid:** patriotic stock image wallpaper, unsupported country statistics, deterministic default to politics-only coverage. **Interactions:** users can pick e.g. Nigeria + Fashion without losing selected country. Country pages for no-coverage countries must show transparent state.

## S07. Fintech/Telecom sector hub `/topic/fintech`

**Hero:** topic label, plain-English scope. **Sections:** cross-country developments, comparison links, source-backed explainers, business listings, sponsor placement. **Safety:** never place a paid placement adjacent to analysis so that it looks like an editorial recommendation; `Sponsored` visually distinct. **Interaction:** country facets across any topic including mobile data pricing, mobile money, retail, hospitality, etc.

## S08. Founder Spotlight `/founders` and `/business/[slug]`

**Fields:** verified business/organization name (only if verified), country, category, product story, website, supplied imagery with rights, challenges/lessons, last update, business-submitted vs editorially reported claims. **Actions:** visit business website, share, discuss, submit feedback; optionally request information with rate protection. **Label:** `Editorial Spotlight` vs `Sponsored Spotlight`. **No:** AI-generated customer testimonials or synthetic praise. **Unverified state:** prominently `Information submitted by the organization, pending verification` and withheld from featured ranking.

## S09. Member participation/auth sheet

**Trigger:** unauthenticated reply/vote/follow/save. **UI:** lightweight modal or drawer: `Join the conversation`, `Continue with email` and verified working identity providers only; explain `Reading and sharing stay free.` **Important:** preserve return URL and unsent text without placing a sensitive draft in an open redirect query string. Inline comment editor has character limits and preview, markdown sanitization and clear submission status. **Failures:** invalid account, expired link, throttled request, network offline, retry; never discard draft on error.

## S10. Communities and public profile

**Community:** topic/country group context, rules, real threads, moderators where appointed, related categories and genuine human count only if measured. **Profile:** display name, selected public bio, `Human`, `Editorial AI` or `Verified organization` badge, actual published contributions, report control. **Agent profile:** role definition, model disclosure, last active, references to source-backed work, never simulated human life. Private info remains private.

## S11. Command Center overview `/admin`

**Visual style:** Midnight Command Center rail with Tangerine selected state, dense white/ivory work area, neutral telemetry palettes and explicit no-data state. **Header:** tenant, date window, `Publishing paused` switch with reason, real system state. **Scorecards:** actual human engagement, published, pending review, source failures, AI queue/latency, current inference budget, backup age, sponsor integration status. **Charts:** daily visits, referral channels, content outcomes with `Not enough data` fallback. **Task rail:** oldest pending review, failed source, moderation priority, stalled jobs. **Interactions:** drill into source tables, not just pretty static charts. **Mobile:** admin readable but complex tables horizontally scroll with captions.

## S12. Editorial queue and source health `/admin/editorial` `/admin/sources`

**Queue columns:** item, source/time, country/topic, risk, evidence completeness, duplicate cluster, model status, assigned reviewer, action. **Detail drawer:** original URL, rights record, claims/evidence, draft revisions, approve/hold/merge/publish/schedule/correct with audit logs and optimistic locking. **Source management:** endpoint, trust tier, license status, fetch enabled, last success/error, fetch frequency, manual test with safe SSRF checks. **Publish** disabled if gates fail; editor must write override reason where permitted.

## S13. AI operations and providers `/admin/ai`

**Tabs:** Runs, Model routes, Editorial roles, Prompt versions, Budgets. **Telemetry:** Ollama local status, queue depth, success/failure/timeout, token usage when known, wall-clock duration, provider name/model and fallback reason. **Controls:** per-tenant task quotas, max concurrency, pause AI, approved model choice; sensitive settings change audited. Provider secrets masked, never copyable to client. **No:** model invocation from page render.

## S14. Audience, referrals, content analytics `/admin/analytics`

**Date filters:** today/7/30 days/custom; geographic/country/topic; tenant-scoped data. **Panels:** pseudonymous browser reach labeled estimation, human contributions, returning reader estimates, stories with actual source-click/share/referral engagement, corrections, inbound search where connected. **Funnel:** viewed → source explored → shared clicked → referred session (not equal to external confirmed share). **States:** real 0 vs tracking disabled vs data delayed. Tables export only authorized aggregate data.

## S15. Advertise `/advertise`

**Hero:** reach readers interested in real conversations and African products without editorial influence. **Options:** sponsor an approved community/topic, feed display slots, disclosed spotlight, future newsletter. No fabricated rate card, reach or sponsor logos. **Form:** organization, name, verified email, country, topic, description, budget range optional, required consent; spam protection, confirmation with tracking ID. **Server:** secure inquiry capture and EspoCRM bridge; retries and fallback, no direct browser access to CRM token.

## S16. White-label manager and example tenant

**Admin:** tenant list, status, brand tokens and hostnames, feature flags, quota/analytics and scope. **Tenant sample:** a safely isolated hypothetical `Sample Africa Community` theme and a few obviously marked demo entries; no real domain claim. **Switch:** platform admin explicit scoped context; tenant admins may never switch to another tenant. Test separate session credentials, API filtering, file URLs and telemetry. Billing cadence fields displayed as `Not enabled` until integrations exist.

## S17. About/footer

**About layout:** readable editorial text from `06`, visual accent not giant stock-photo hero, `Why we exist`, `How AI contributes`, `How to submit/correct`, `Founder and business discovery`. **Footer:** `© {year} Palavva`, `Built for curious minds, powered by AI.`, About, Developers, Advertise, Help, Terms, Privacy, Editorial principles, Corrections; unobtrusive human founder-credit text with no invented social profile.

## S18. Editorial principles / transparency / corrections

**Layout:** contents list and clear sections explaining sources, AI labels, human review, ads, corrections, report flow. **Corrections index:** public revised stories with corrected claims, revision dates, transparent retained original link where lawful. **Form:** link, issue, evidence URL, optional contact, respectful notice about editorial review. **No:** promise of specific response SLA unless operationally implemented.

## Additional signed-in pages

`/account`: basic bio, language preferences, deletion/export entry, notification consent. `/saved`: personal bookmarks with removal. `/following`: followed topics/countries/members. `/submit`: story source URL and reason, business assertion and rights attestation, moderation queue status. `/notifications`: sparse real events only, no synthetic urgency. `/my-agents`: if disabled, show honest future-feature description without nonworking onboarding CTA.

## Component accessibility rules

Use native links for navigation; buttons for action; focus trap/return in modals; descriptive aria labels on icon-only buttons; semantic headings; label filter groups; live region for new-story toast and form status; keyboard scroll/focus for chip lists; dates as full datetime and relative friendly text; external-link warnings where helpful. Maintain text hierarchy and source-link contrast on every theme.
