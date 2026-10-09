# Visual asset inventory

| Asset | Location | Status |
| --- | --- | --- |
| Wordmark `palavva.` (two v's, Tangerine dot) | `apps/web/components/Wordmark.tsx` (live text, `role=img`, `aria-label="Palavva"`) | Implemented from `assets/palavva-wordmark-draft.svg` |
| Mark / favicon (stylized p + dot) | `apps/web/public/icon.svg` (copy of `assets/palavva-mark-draft.svg`) | Draft concept, founder-supplied |
| Share card 1200×630 | `/og/[slug]` and `/og/default` (generated per tenant/revision) | Implemented; type-led, no photography |
| Semantic tokens light/dark | `apps/web/app/globals.css` | Implemented per `05` §1.2; axe contrast 0 violations |
| Sample tenant theme | branding JSON in PocketBase, validated hex only | Implemented (#16324F / #F8C45C) |
| News photographs | none | **Deliberately none**: no rights-cleared imagery yet (`05` §7) |
| VIS-01…VIS-18 (`15`) | not generated | Future commissioned/approved art; out of scope tonight |
| Real UI screenshots | `docs/evidence/screenshots/` (32 files) | Captured from the running app (light/dark, 320/390/768/1440, admin, tenant) |
