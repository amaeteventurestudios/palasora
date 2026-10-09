# 03. Information architecture, routes and permissions

## Global hierarchy

Public navigation: wordmark (home), Explore feed, Discover, Countries, Topics, Palavva Stories, Founder Spotlight, search and sign-in/account. On desktop, visible Feed tabs `Live | Trending | Random | New | Top | Discussed | Discover`, a separate country row, then a topic row. On phone, compact masthead + scrollable chips and tabs, not a huge hero.

**Main six topic groups:** Money & Business; Food & Lifestyle; Culture & Entertainment; Mobility & Infrastructure; Technology & Innovation; Society & Development. Detail taxonomy follows the 25 sectors in the handoff; store as data, not 25 hard-coded dashboards. All-African + country + sector + language filters combine rather than forcing separate nested communities.

## Canonical route contract [implementation default; consistent slugs]

| Route | View | Visibility | Key behavior |
| --- | --- | --- | --- |
| `/` | Live homepage | Public | Above-fold story feed, country/topic controls |
| `/feed/[mode]` | Feed variants | Public | `live`, `trending`, `random`, `new`, `top`, `discussed` |
| `/discover` | Curated discovery | Public | Topic, history, founder and country gateways |
| `/search?q=&country=&topic=&lang=` | Search | Public | FTS results, empty and typo states |
| `/countries` `/country/[slug]` | Country directory/hub | Public | 54 entries possible, initial content by verified availability |
| `/topics` `/topic/[slug]` | Topic directory/hub | Public | Sector browse; combinations via query filters |
| `/stories` `/story/[slug]` | Palavva Stories/detail | Public | Edited research feature, author/corrections |
| `/discussion/[slug]` | Discussion detail | Public | News evidence + AI perspectives + human replies |
| `/time-lens/[slug]` | Historic link or era | Public | Source-backed history and era filters |
| `/take-me-back?era=1980s` | Archive exploration | Public | Empty when no verified archives, not AI invented records |
| `/communities` `/community/[slug]` | Communities | Public | Real discussion categories/people; no bot inflation |
| `/founders` `/business/[slug]` | Founder/business spotlight | Public | Editorial or Sponsored disclosure, verification state |
| `/profile/[handle]` | Public member/agent profile | Public | `Human` / `Editorial AI` / `Organization` labels |
| `/about` `/editorial` `/ai-transparency` | Trust info | Public | Values, AI process and boundaries |
| `/corrections` `/help` `/contact` | Trust/support | Public | Corrections and secure contact/report flows |
| `/advertise` | Advertiser inquiry | Public | Captcha/rate limits, consent, Espo bridge or safe fallback |
| `/developers` | API policies | Public | Future features only described as future until live |
| `/terms` `/privacy` | Legal | Public | Draft blocked from public until legal review |
| `/auth/sign-in` `/auth/sign-up` | Authentication | Public | Redirect and draft preservation |
| `/account` `/saved` `/following` | Member workspace | Member | Identity/notifications/preferences |
| `/submit` | Story/product proposal | Member | All submissions queued for review |
| `/organization/[id]/manage` | Company workspace | Verified rep | Authorized organization only |
| `/my-agents` | External agent manager | Feature-flagged | Disabled placeholder until safe integration exists |
| `/admin/*` | Command Center | Admin/editor scoped | Server-enforced RBAC, audited actions |
| `/tenant-admin/*` | Tenant command subset | Tenant admin | Zero cross-tenant access |

Stable slug uniqueness is tenant-scoped. Slug changes require redirects; deleted/moderated records return correct 404/410 with no leaking draft data. Unreviewed drafts, demo records and member-only actions do not enter sitemaps.

## Command Center menu

Overview; Editorial Queue; News Sources; AI Operations; Content & Moderation; Audience Analytics; Distribution & Search; Sponsors & Inquiries; Businesses & Founders; Tenants; System Health; Settings & Audit. These are Palavva-specific integration views, not copies of all functions already found in Revive/EspoCRM.

## Context preservation

Country/topic/active feed mode live in URL query. Save search query across navigation/back. Clicking comment from public page invokes sign-in sheet over preserved route, stores unsent comment locally/session securely and resumes after authorized return. Share/read never triggers sign-in. Locale selected explicitly, not inferred purely from IP.

## Publishing hierarchy

`source_item` (external discovery) → `story_cluster` (event across sources) → `editorial_piece` (approved Palavva writeup) → `discussion` (AI and human comments). Original source attribution and correction history flow through all levels. `user_submission` is not a published claim before verification. Public profile is not a publication authority.

## Discover taxonomy and feed semantics

- Live = newest meaningful publication/update times, updated without scroll jumps.
- New = latest first publication times. Top = human votes/meaningful engagement over visible window.
- Trending = recency-weighted genuine human interest + source diversity, spam-limited; no simulated votes.
- Most Discussed = counted genuine human comments, AI responses excluded.
- Random = deterministic page-specific shuffle of eligible published stories, no unreviewed/low-quality entries.
- Discover = editor-curated and category-diverse stories, transparent `Editor's pick` indicator.
- Communities = browsable topics/countries/real member relationships, not mandatory separate databases for each combination.

## Access failures

`401` means login needed; `403` means logged-in but not authorized; `404` masks cross-tenant resource existence; `409` for stale editorial revisions; `422` for input validation. Avoid ambiguous silent redirects to homepage.
