# 14. SEO, social distribution and earned attention

## Distribution goal

A genuinely sourced Palavva conversation can be read without a login and shared naturally on WhatsApp, Facebook, X, and through a plain URL. Search and social previews reflect what the article truly says. Earned journalist attention is possible only if the work merits it; **no guarantee of Google News, Discover, Yahoo syndication or viral audience**.

## URL and metadata rules

- Canonical stable detail paths `/discussion/[slug]` and `/story/[slug]`; 301 redirects for changed slugs, 404/410 appropriate for removed content, tenant-specific canonical domain.
- Next.js SSR metadata includes unique title, standfirst description, actual headline, public published/modified date, language, country/topic, `og:type`, OG headline/description/image/URL, `twitter:card=summary_large_image`, alternate language only where real translation exists.
- Site-wide `robots.txt` blocks private account/admin/internal staging; live public sitemap includes only published rights-cleared, substantive, indexable pages, with meaningful last-modified date. Staging is `noindex` and password/allowlist protected.
- Share images default **1200 × 630** or host platform's current supported ratio, legible at small sizes, alt text and approved photographic rights. Canvas/card text from edited headline, not LLM unreviewed variant. Use `og:image:width/height`, caching with revision hash on corrections.
- Include `Article`/appropriate publisher structured data for published Palavva editorial articles, correct dates and transparency. For genuine **human-authored** discussions, assess `DiscussionForumPosting` only when its published policy matches the content. Google's guidelines explicitly exclude publisher/agent-authored posts from forum markup; do not mislabel AI-generated Palavva articles as human forum posts. https://developers.google.com/search/docs/appearance/structured-data/discussion-forum
- No fabricated user review ratings, `FAQPage` stuffed for rankings, false author identities, fake journalist credits or auto-generated doorway country pages.

## Sharing actions

- `WhatsApp`: open approved `https://wa.me/?text=` or relevant intent URL with URL-encoded real title and canonical link; handle installed app/unavailable browser fallback.
- `X`: open `https://twitter.com/intent/tweet?text=...&url=...` with accurate title/link; label simply `X`.
- `Facebook`: use legitimate sharer dialog or current approved share pathway with canonical URL; no unaudited posting API claim.
- `Copy link`: native clipboard when available, keyboard accessible fallback and `Link copied` confirmation.
- `Web Share API`: optional mobile enhancement with browser support check, otherwise provide explicit options. **One click** suffices for intent, not proof of external share actually posted.
- Quote cards: attributed factual excerpts only, avoid lifting prohibited copyrighted paragraphs, include source and Palavva context. No fake article image.

## Public preview and crawler tests

Use tests that fetch HTML with JS disabled and bot user agents, assert title/description/OG/canonical/robots/schema, inspect linked 1200×630 asset, confirm source links, dates and correction version, and ensure private pages/noindex stage absent from sitemap. Test WhatsApp, Facebook and X intent URLs, Unicode African names and accent/punctuation percent-encoding; use provider debugging tools when credentials/permissions available, no claim that they were submitted without execution.

## Editorial promotion loop

`real event → independent research → useful accessible explanation → link/share asset → voluntary readers → repeat reading and responses → possible press interest`. Community managers can share approved public links on legitimate channels with disclosed affiliation; no fake accounts, automatic mass commenting, engagement purchasing, synthetic shares, bulk platform-rule violations or concealed sponsor placement. Prescreen press pitches for genuine novelty and citations, not fabricated traffic/coverage.

## Analytics reconciliation

Track `share_clicked`, URL copy, UTM sources, actual referred sessions and Search Console visits **if connected**. A share click does not equal social distribution, and an inbound referral isn't automatically attributed to a specific click without instrumented evidence. Surface exact definitions in dashboard.

## Optional digest

When justified by verified interest, assess maintained open-source newsletter software for subscription consent, unsubscribe and deliverability; do not install/advertise a newsletter at MVP unless real sending and opt-outs are tested.
