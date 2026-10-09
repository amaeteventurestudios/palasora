# 05. UI design system, theme tokens and component contract

**Design thesis:** African-rooted contemporary editorial product, warmly colored and readable, not generic white SaaS or cinematic marketing. Feed-first. Favor typography, source clarity, and genuine story images over ornamental illustrations.

## 1. Founder-approved visual direction: Midnight + Tangerine (binding, 2026-10-08)

**Status: APPROVED.** The founder explicitly rejected forest green and selected **Midnight + Tangerine**. This decision supersedes the historic exploratory forest/cream/gold palette in `00-PROJECT-HANDOFF.md`. Do not ship the earlier green visuals, use green as Palavva's primary brand color, or reinterpret the approved direction in implementation. Product architecture and editorial decisions in the handoff remain binding.

**Emotional and functional brief:** Modern African digital newsroom meets lively, open social conversations. Confident, distinctive, smart and warm; serious about source evidence, never a heavy institutional portal, generic all-white dashboard, neon gaming interface, or enormous cinematic marketing hero. Story feed and real headlines must remain above the fold.

### 1.1 Core identity swatches

| Name | Hex | Role |
| --- | --- | --- |
| **Midnight** | `#1B2030` | Masthead, footer, dark surfaces, dense editorial headings, Command Center sidebar |
| **Tangerine** | `#E85E31` | Brand dot, strokes, active selections, small key highlights and large/decorative accent areas |
| **Warm Gold** | `#F8C45C` | Secondary editorial accents, verified history/Time Lens detail and occasional editorial feature accents |
| **Ivory** | `#F8F5F0` | Default reading canvas in light mode, giving warmth without yellow/green cast |

### 1.2 Semantic tokens, accessible variants

| CSS token | Light | Dark | Usage |
| --- | --- | --- | --- |
| `--background` | `#F8F5F0` | `#111520` | Main page background |
| `--card` | `#FFFFFF` | `#262D3E` | Feed and admin cards |
| `--card-muted` | `#FFF1E8` | `#2F3545` | Featured sub-panels / filter hover |
| `--foreground` | `#252A38` | `#F8F5F0` | Primary body and headings |
| `--muted-foreground` | `#616675` | `#BAC1CE` | Secondary metadata |
| `--primary` | `#C34218` | `#E85E31` | Normal-sized button and text/link emphasis, subject to foreground pairing |
| `--primary-foreground` | `#FFFFFF` | `#1B2030` | Text on primary button background |
| `--brand-tangerine` | `#E85E31` | `#E85E31` | Brand accent; avoid small white labels on this shade |
| `--brand-midnight` | `#1B2030` | `#1B2030` | Navbar, footer, editorial dark panels |
| `--brand-gold` | `#F8C45C` | `#F8C45C` | Gold accent only, not body text on light backgrounds |
| `--border` | `#E6E0D9` | `#444A58` | Subtle cards, inputs and dividers |
| `--focus-ring` | `#C34218` | `#F8C45C` | Visible keyboard focus; use outline offset |
| `--danger` | `#A52D30` | `#FFAFB0` | Errors only |
| `--success` | `#17684B` | `#95E2C0` | **Status semantics only**, never core brand identity |

For existing frontend token compatibility, map `--surface -> --background`, `--surface-card -> --card`, `--ink -> --foreground`, `--accent -> --brand-gold`; replace any hardcoded legacy `--brand` green with these semantic values. Set shadcn/Tailwind utilities against the semantic tokens, not repeated literal hexes. Variables apply consistently to public, authenticated, admin, modal, mobile and dynamic OG rendering.

**Contrast constraint:** `#E85E31` with white normal-size text is about **3.46:1** (below WCAG AA 4.5:1). Therefore solid buttons with **white labels** use darker `#C34218` (about **5.11:1**); decorative Tangerine `#E85E31` can use Midnight text (about **4.69:1**) or remain a non-text accent. On Ivory, smaller Tangerine text uses dark variant `#A83813` (about **5.96:1**). Verify every component/background/text pair with an automated WCAG audit, including disabled, hover, focus, selected and dark-mode states.

### 1.3 Visual hierarchy and proportion

- A deep Midnight masthead with the white `palavva` lettering and a Tangerine **dot** is the default public header. Footer and narrow high-emphasis editorial panels may be Midnight too.
- Ivory is the main reading background. Use white cards for content separation, but avoid endless identical white rectangles. Alternate text-first compact feed entries, one high-value prominent feature, crisp headlines and small contextual imagery where licensed.
- Tangerine is selective and meaningful: active feed tab underline, selected filter, primary CTA, brand dot, hover/focus markers and feature cues. Do **not** turn all story cards or every badge orange.
- Gold is used sparingly in Time Lens/archives and highlight strips. Not a generic button color; avoid orange-gold noise.
- Main feed stays visually dominant. A compact masthead and compact headline band cannot push real content below the first desktop/mobile viewport.
- Public product feels editorial and social; the Command Center uses denser data tables, Midnight navigation, neutral/light cards and Tangerine selected states. Tenant themes may override tokens in tenant-scoped rendering only; core Palavva branding remains Midnight + Tangerine.

### 1.4 Category color guidance (optional, not nav-brand substitution)

Technology may use blue `#3273D9`, Culture coral `#D54365`, History muted amber `#A46A12`, Business indigo `#5555B8`. These accent categories are optional and must never identify a topic by color alone. Do not add green as primary UI identity because a category/status happens to use green.

### 1.5 Dark-mode design

Dark mode uses deep `#111520` canvas, `#262D3E` cards, `#F8F5F0` body type, Tangerine `#E85E31` accent with Midnight foreground on filled accent controls, and Warm Gold `#F8C45C` for focus and restrained contrast. Theme switching respects system preference with stored user override and no flash of incorrect theme.


## 2. Typography and density

Use freely redistributable verified-licensed fonts such as `Inter` for UI, feed headlines and brand-led display; `Source Serif 4` selectively for long-form editorial/Time Lens accents, with system fallback. No downloaded font asset may be redistributed without a license check. Base: 16 px body / 1.6 line height (feed summary 14–15 px / 1.45), H1 clamp 27–38 px, H2 22–28 px, feed title 19–22 px, labels 12–13 px. Reading line length 60–75 characters. Page padding: 16 px phone; 24 px tablet; 32 px desktop. Grid 12 columns, 8/4 desktop split, 16–24 px gutters. Vertical scale 4/8/12/16/24/32/48. Card border radius 12 px, buttons 8 px; low/no ornamental shadows, thin borders. Headlines favor strong editorial contrast; feature cards may have restrained midnight/tangerine treatments without oversized billboard heroes.

## 3. Layout tokens

- Masthead height ~64 px desktop, ~56 px mobile. Container max 1320 px. Feed content default 760–820 px within main column; right rail 280–320 px.
- Feed card: 16–20 px padding, title 1–3 lines, lede <= 3 lines, source/country meta, action footer, optional licensed thumbnail at fixed ratio without layout shift.
- Detail: article column 720 px; references/sources visible near lead, not hidden behind a paywall. Human replies full width inside article, nested depth visually limited to protect mobile space.
- Button touch target >= 44×44 px; minimum table row 44 px in admin. Sticky masthead optional, avoid covering anchors.
- Media thumbnails: 16:9 if editorially useful, responsive widths, CDN-independent lightweight AVIF/WebP fallback; no photo = typography-first card.

## 4. Brand elements

`PalavvaWordmark`: lowercase `palavva.` in strong custom typographic styling; dot **must be Tangerine** `#E85E31` in Palavva brand contexts; maintain two v's. `PalavvaMark`: use a distinct circular speech/discovery motif or stylized letter p, not an Africa map silhouette by default. Accessible text alt `Palavva`. No emoji-as-logo. Export SVG and raster sizes after actual design review.

## 5. Design-system inventory

| Component | Anatomy and required behavior |
| --- | --- |
| `SiteHeader` | Wordmark, public search, navigate, sign-in/account, mobile menu |
| `FeedTabs` | Real links with selected state, keyboard, preserved filters |
| `CountrySelector` | `All Africa` + priority chips + full searchable country menu |
| `TopicSelector` | 6 groups + sector drilldown, combinable URL params |
| `StoryCard` | Label, H3 link, source/date/country, lede, real actions/counts |
| `SourceCitation` | Original publisher, title, dated link, provenance state |
| `AIContribution` | `AI analysis` disclosure, role, evidence anchors, timestamp |
| `HumanComment` | Human handle, authored/edited date, permitted vote/report |
| `TimeLensCard` | Era, archive source, similarity/difference, caveats |
| `SponsoredSlot` | Visible `Sponsored`, approved Revive zone, no fake filler |
| `FounderCard` | Business name, country, category, independent/paid label |
| `AuthSheet` | Accessible dialog, return context and draft preservation |
| `CorrectionBanner` | Updated fact, timestamp, public revision link |
| `AdminMetric` | Value, unit, scope, measured period, source, empty/delay states |
| `ReviewDecisionPanel` | Source rights, claim links, approve/hold/merge, revision guard |
| `ErrorState` | Explanation, recovery action, incident tracking where appropriate |
| `ToastNewContent` | New count as measured, inserts on click, preserves scroll |

## 6. Icons and motion

Use Lucide icons where license-compatible; icons always accompany text for critical moderation/source/AI/sponsor states. Avoid gratuitous national flags in place of readable country names. Motion <= 150–200 ms for menus/dialogs; respect reduced-motion preference; no autoplay flashes, animated bot activity or scrolling manipulation.

## 7. Image identity

Favor genuine, permissioned photographs from credited African photographers, archival imagery with explicit usage rights, editorial diagrams and readable type-led share cards. When using AI-generated editorial artwork, label `Illustration` and avoid conveying a fictionalized depiction as a real news photograph. Add alt text, credit and rights metadata. For many headline cards, **no image is preferable to irrelevant stock art**.

## 8. Reference screen grids

**Desktop:** top header | compact headline + chips | feed tab row | 760 px card stream + 300 px sidebar | footer. **Mobile:** 56 px masthead | line of positioning | swipe chips | tabs | card stream | inline sidebar below content | footer. **Admin:** sidebar (collapsible) + title/context | verified KPIs | data table/chart panels | detail drawers. No second bespoke admin product outside the existing Next.js app.

## 9. Acceptance visual checklist

Review real captures in light/dark at 320, 375, 768, 1024, 1440 px: first story above fold; no generic blank white; clear AI/human/sponsor labels; source visible; readable line lengths; 44 px taps; stable cards as images load; accessible focus and no clipped filters; admin's KPI units/periods explicit; no misleading fictitious content.
