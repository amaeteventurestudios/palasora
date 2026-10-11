# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: admin.spec.ts >> T-029 Overview shows real, labeled metrics and integration states; screenshots
- Location: tests/e2e/admin.spec.ts:24:5

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByRole('heading', { level: 1 })
Expected: visible
Error: strict mode violation: getByRole('heading', { level: 1 }) resolved to 2 elements:
    1) <h1 class="text-[24px] font-extrabold tracking-tight sm:text-[28px]">News & sources</h1> aka getByRole('heading', { name: 'News & sources' })
    2) <h1 class="text-[26px] font-extrabold tracking-tight">Source registry</h1> aka getByRole('heading', { name: 'Source registry' })

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for getByRole('heading', { level: 1 })

```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - main [ref=e2]:
    - generic [ref=e3]:
      - generic [ref=e6]:
        - generic [ref=e8]:
          - paragraph [ref=e9]: Command Center
          - paragraph [ref=e10]: Palavva
          - paragraph [ref=e11]: Local Editor · editor
        - generic [ref=e12]:
          - generic [ref=e13]:
            - generic [ref=e14]: Overview
            - list [ref=e16]:
              - listitem [ref=e17]:
                - link "Overview" [ref=e18] [cursor=pointer]:
                  - /url: /admin
                  - img [ref=e19]
                  - text: Overview
              - listitem [ref=e24]:
                - link "Reports & evidence" [ref=e25] [cursor=pointer]:
                  - /url: /admin/reports
                  - img [ref=e26]
                  - text: Reports & evidence
          - generic [ref=e29]:
            - generic [ref=e30]: Audience
            - list [ref=e32]:
              - listitem [ref=e33]:
                - link "Audience & retention" [ref=e34] [cursor=pointer]:
                  - /url: /admin/audience
                  - img [ref=e35]
                  - text: Audience & retention
              - listitem [ref=e40]:
                - link "Countries & languages" [ref=e41] [cursor=pointer]:
                  - /url: /admin/geography
                  - img [ref=e42]
                  - text: Countries & languages
              - listitem [ref=e47]:
                - link "Event pipeline" [ref=e48] [cursor=pointer]:
                  - /url: /admin/analytics
                  - img [ref=e49]
                  - text: Event pipeline
          - generic [ref=e51]:
            - generic [ref=e52]: Agents & AI
            - list [ref=e54]:
              - listitem [ref=e55]:
                - link "Agent City" [ref=e56] [cursor=pointer]:
                  - /url: /admin/agent-city
                  - img [ref=e57]
                  - text: Agent City
              - listitem [ref=e60]:
                - link "Models & Jev" [ref=e61] [cursor=pointer]:
                  - /url: /admin/models
                  - img [ref=e62]
                  - text: Models & Jev
              - listitem [ref=e65]:
                - link "City controls" [ref=e66] [cursor=pointer]:
                  - /url: /admin/city
                  - img [ref=e67]
                  - text: City controls
              - listitem [ref=e68]:
                - link "Conversations" [ref=e69] [cursor=pointer]:
                  - /url: /admin/conversations
                  - img [ref=e70]
                  - text: Conversations
              - listitem [ref=e73]:
                - link "Exceptions" [ref=e74] [cursor=pointer]:
                  - /url: /admin/exceptions
                  - img [ref=e75]
                  - text: Exceptions
              - listitem [ref=e77]:
                - link "Editorial AI runs" [ref=e78] [cursor=pointer]:
                  - /url: /admin/ai
                  - img [ref=e79]
                  - text: Editorial AI runs
          - generic [ref=e81]:
            - generic [ref=e82]: Content & Regions
            - list [ref=e84]:
              - listitem [ref=e85]:
                - link "Social & SubPals" [ref=e86] [cursor=pointer]:
                  - /url: /admin/social
                  - img [ref=e87]
                  - text: Social & SubPals
              - listitem [ref=e90]:
                - link "News & sources" [ref=e91] [cursor=pointer]:
                  - /url: /admin/sources
                  - img [ref=e92]
                  - text: News & sources
              - listitem [ref=e96]:
                - link "Editorial queue" [ref=e97] [cursor=pointer]:
                  - /url: /admin/editorial
                  - img [ref=e98]
                  - text: Editorial queue
              - listitem [ref=e101]:
                - link "Translations" [ref=e102] [cursor=pointer]:
                  - /url: /admin/translations
                  - img [ref=e103]
                  - text: Translations
              - listitem [ref=e107]:
                - link "Geo QA" [ref=e108] [cursor=pointer]:
                  - /url: /admin/geo
                  - img [ref=e109]
                  - text: Geo QA
              - listitem [ref=e112]:
                - link "Trend audit" [ref=e113] [cursor=pointer]:
                  - /url: /admin/trends
                  - img [ref=e114]
                  - text: Trend audit
              - listitem [ref=e117]:
                - link "Moderation" [ref=e118] [cursor=pointer]:
                  - /url: /admin/moderation
                  - img [ref=e119]
                  - text: Moderation
          - generic [ref=e121]:
            - generic [ref=e122]: Economy
            - list [ref=e124]:
              - listitem [ref=e125]:
                - link "Pals economy" [ref=e126] [cursor=pointer]:
                  - /url: /admin/pals
                  - img [ref=e127]
                  - text: Pals economy
              - listitem [ref=e132]:
                - link "Virtual Exchange" [ref=e133] [cursor=pointer]:
                  - /url: /admin/exchange
                  - img [ref=e134]
                  - text: Virtual Exchange
          - generic [ref=e138]:
            - generic [ref=e139]: Commerce
            - list [ref=e141]:
              - listitem [ref=e142]:
                - link "Revenue & business" [ref=e143] [cursor=pointer]:
                  - /url: /admin/revenue
                  - img [ref=e144]
                  - text: Revenue & business
              - listitem [ref=e147]:
                - link "Sponsors & inquiries" [ref=e148] [cursor=pointer]:
                  - /url: /admin/sponsors
                  - img [ref=e149]
                  - text: Sponsors & inquiries
              - listitem [ref=e152]:
                - link "Businesses" [ref=e153] [cursor=pointer]:
                  - /url: /admin/businesses
                  - img [ref=e154]
                  - text: Businesses
              - listitem [ref=e158]:
                - link "Distribution & search" [ref=e159] [cursor=pointer]:
                  - /url: /admin/distribution
                  - img [ref=e160]
                  - text: Distribution & search
          - generic [ref=e166]:
            - generic [ref=e167]: Operations
            - list [ref=e169]:
              - listitem [ref=e170]:
                - link "Reliability & security" [ref=e171] [cursor=pointer]:
                  - /url: /admin/ops
                  - img [ref=e172]
                  - text: Reliability & security
              - listitem [ref=e175]:
                - link "System health" [ref=e176] [cursor=pointer]:
                  - /url: /admin/health
                  - img [ref=e177]
                  - text: System health
              - listitem [ref=e179]:
                - link "Settings & audit" [ref=e180] [cursor=pointer]:
                  - /url: /admin/settings
                  - img [ref=e181]
                  - text: Settings & audit
        - list [ref=e185]:
          - listitem [ref=e186]:
            - link "Back to Palavva" [ref=e187] [cursor=pointer]:
              - /url: /
              - img [ref=e188]
              - text: Back to Palavva
        - button "Toggle Sidebar" [ref=e190]
      - main [ref=e191]:
        - generic [ref=e192]:
          - button "Toggle Command Center navigation" [ref=e193]:
            - img
            - generic [ref=e194]: Toggle Sidebar
          - paragraph [ref=e195]: Command Center
          - generic [ref=e196]: local development
          - search [ref=e197]:
            - generic [ref=e198]: Search public content
            - textbox "Search public content" [ref=e199]:
              - /placeholder: Search content…
        - generic [ref=e201]:
          - generic [ref=e202]:
            - generic [ref=e203]:
              - heading "News & sources" [level=1] [ref=e204]
              - paragraph [ref=e205]: "3 feed items ingested in scope: 2 used, 0 became cards only (7-30 days old), 0 ignored as stale. 0 sources healthy, 0 failing."
            - generic [ref=e207]:
              - combobox "Date range" [ref=e208]:
                - img
                - generic: Last 30 days
                - img
              - combobox "Country" [ref=e209]:
                - img
                - generic: 🌍 All Africa
                - img
          - paragraph [ref=e210]: "Scope: 2026-09-12 to 2026-10-11 (UTC, 30 days) · All Africa · computed 01:44 UTC from live records"
          - generic [ref=e211]:
            - generic [ref=e213]:
              - generic [ref=e214]:
                - paragraph [ref=e215]: Sources healthy
                - button "Definition of Sources healthy" [ref=e216]:
                  - img [ref=e217]
              - paragraph [ref=e220]: "0"
            - generic [ref=e222]:
              - generic [ref=e223]:
                - paragraph [ref=e224]: Sources stale
                - button "Definition of Sources stale" [ref=e225]:
                  - img [ref=e226]
              - paragraph [ref=e229]: "0"
            - generic [ref=e231]:
              - generic [ref=e232]:
                - paragraph [ref=e233]: Sources failing
                - button "Definition of Sources failing" [ref=e234]:
                  - img [ref=e235]
              - paragraph [ref=e238]: "0"
            - generic [ref=e240]:
              - generic [ref=e241]:
                - paragraph [ref=e242]: Sources never
                - button "Definition of Sources never" [ref=e243]:
                  - img [ref=e244]
              - paragraph [ref=e247]: "0"
            - generic [ref=e249]:
              - generic [ref=e250]:
                - paragraph [ref=e251]: Sources off
                - button "Definition of Sources off" [ref=e252]:
                  - img [ref=e253]
              - paragraph [ref=e256]: "8"
          - generic [ref=e257]:
            - generic [ref=e258]:
              - generic [ref=e259]:
                - generic [ref=e260]: Ingest outcomes per day
                - generic [ref=e261]: What happened to each fetched item
              - generic [ref=e262]:
                - generic [ref=e265]:
                  - generic:
                    - generic:
                      - generic: 2026-10-05
                      - generic:
                        - generic:
                          - generic:
                            - generic:
                              - generic: Used
                            - generic: "0"
                        - generic:
                          - generic:
                            - generic:
                              - generic: Card only
                            - generic: "0"
                        - generic:
                          - generic:
                            - generic:
                              - generic: Stale (ignored)
                            - generic: "0"
                        - generic:
                          - generic:
                            - generic:
                              - generic: Not about Africa
                            - generic: "0"
                  - generic [ref=e267]:
                    - generic [ref=e268]: Card only
                    - generic [ref=e270]: Not about Africa
                    - generic [ref=e272]: Stale (ignored)
                    - generic [ref=e274]: Used
                  - application [ref=e276]:
                    - generic [ref=e294]:
                      - generic [ref=e295]:
                        - generic [ref=e297]: 16/09
                        - generic [ref=e299]: 21/09
                        - generic [ref=e301]: 26/09
                        - generic [ref=e303]: 01/10
                        - generic [ref=e305]: 06/10
                        - generic [ref=e307]: 11/10
                      - generic [ref=e308]:
                        - generic [ref=e310]: "0"
                        - generic [ref=e312]: "1"
                        - generic [ref=e314]: "2"
                        - generic [ref=e316]: "3"
                        - generic [ref=e318]: "4"
                - group [ref=e319]:
                  - generic "View as table" [ref=e320] [cursor=pointer]
            - generic [ref=e321]:
              - generic [ref=e322]:
                - generic [ref=e323]: Freshness of newest item per source
                - generic [ref=e324]: Age of each active source's newest item in the window
              - application [ref=e329]:
                - generic [ref=e333]:
                  - generic [ref=e334]:
                    - generic [ref=e336]: <1 d
                    - generic [ref=e338]: 1-7 d
                    - generic [ref=e340]: 7-30 d
                    - generic [ref=e342]: 30-365 d
                    - generic [ref=e344]: none in window
                  - generic [ref=e345]: age
                  - generic [ref=e346]:
                    - generic [ref=e348]: "0"
                    - generic [ref=e350]: "1"
                    - generic [ref=e352]: "2"
                    - generic [ref=e354]: "3"
                    - generic [ref=e356]: "4"
          - generic [ref=e357]:
            - generic [ref=e358]:
              - generic [ref=e360]: Source cards by country × language
              - table [ref=e363]:
                - rowgroup [ref=e364]:
                  - row "Subject country en" [ref=e365]:
                    - columnheader "Subject country" [ref=e366]
                    - columnheader "en" [ref=e367]
                - rowgroup [ref=e368]:
                  - row "Kenya 1" [ref=e369]:
                    - cell "Kenya" [ref=e370]
                    - cell "1" [ref=e371]
                  - row "Ghana 1" [ref=e372]:
                    - cell "Ghana" [ref=e373]
                    - cell "1" [ref=e374]
            - generic [ref=e375]:
              - generic [ref=e376]:
                - generic [ref=e377]: Card risk tiers
                - generic [ref=e378]: 2 published · 0 held for editors (high risk)
              - application [ref=e383]:
                - generic [ref=e397]:
                  - generic [ref=e398]:
                    - generic [ref=e400]: low
                    - generic [ref=e402]: medium
                    - generic [ref=e404]: high
                  - generic [ref=e405]:
                    - generic [ref=e407]: "0"
                    - generic [ref=e409]: "1"
                    - generic [ref=e411]: "2"
                    - generic [ref=e413]: "3"
                    - generic [ref=e415]: "4"
          - generic [ref=e416]:
            - generic [ref=e418]: Exceptions
            - list [ref=e420]:
              - listitem [ref=e421]:
                - img [ref=e422]
                - generic [ref=e424]:
                  - paragraph [ref=e425]:
                    - generic [ref=e426]: "Warning:"
                    - text: "Liberia: no new source card in this window"
                  - paragraph [ref=e427]: Its subject feed exists but published nothing recent; onboard another rights-cleared source
                - generic [ref=e428]: Warning
              - listitem [ref=e429]:
                - img [ref=e430]
                - generic [ref=e432]:
                  - paragraph [ref=e433]:
                    - generic [ref=e434]: "Warning:"
                    - text: "Cameroon: no new source card in this window"
                  - paragraph [ref=e435]: Its subject feed exists but published nothing recent; onboard another rights-cleared source
                - generic [ref=e436]: Warning
              - listitem [ref=e437]:
                - img [ref=e438]
                - generic [ref=e440]:
                  - paragraph [ref=e441]:
                    - generic [ref=e442]: "Warning:"
                    - text: "Senegal: no new source card in this window"
                  - paragraph [ref=e443]: Its subject feed exists but published nothing recent; onboard another rights-cleared source
                - generic [ref=e444]: Warning
          - generic [ref=e445]:
            - generic [ref=e446]:
              - heading "Source registry" [level=1] [ref=e447]
              - paragraph [ref=e448]: Sources are fetched only when rights are approved AND fetching is enabled. A healthy badge needs a recent success, not just a valid URL.
            - generic [ref=e449]:
              - region "African Development Bank" [ref=e450]:
                - generic [ref=e451]:
                  - heading "African Development Bank" [level=2] [ref=e452]
                  - generic [ref=e453]: "Rights: pending"
                  - generic [ref=e454]: link_only
                  - generic [ref=e455]: Not fetching
                - paragraph [ref=e456]: No endpoint · official/primary · every 60 min
                - paragraph [ref=e457]: Last attempt never · last success never · next due never · items 0 total, 0 in 24h, 0 ignored
                - paragraph [ref=e458]: "Rights notes: Candidate from 07. Document license not verified."
                - button "Test fetch" [ref=e462] [cursor=pointer]
                - group [ref=e463]:
                  - generic "Record a rights approval" [ref=e464] [cursor=pointer]
                  - option "Link only" [selected]
                  - option "Metadata only"
                  - option "Permitted excerpt"
                  - option "Licensed full text"
              - region "African Union press releases" [ref=e465]:
                - generic [ref=e466]:
                  - heading "African Union press releases" [level=2] [ref=e467]
                  - generic [ref=e468]: "Rights: pending"
                  - generic [ref=e469]: link_only
                  - generic [ref=e470]: Not fetching
                - paragraph [ref=e471]: No endpoint · official/primary · every 60 min
                - paragraph [ref=e472]: Last attempt never · last success never · next due never · items 0 total, 0 in 24h, 0 ignored
                - paragraph [ref=e473]: "Rights notes: Candidate from 07. Automated access eligibility and terms not verified."
                - button "Test fetch" [ref=e477] [cursor=pointer]
                - group [ref=e478]:
                  - generic "Record a rights approval" [ref=e479] [cursor=pointer]
                  - option "Link only" [selected]
                  - option "Metadata only"
                  - option "Permitted excerpt"
                  - option "Licensed full text"
              - region "Africanews" [ref=e480]:
                - generic [ref=e481]:
                  - heading "Africanews" [level=2] [ref=e482]
                  - generic [ref=e483]: "Rights: pending"
                  - generic [ref=e484]: link_only
                  - generic [ref=e485]: Not fetching
                - paragraph [ref=e486]: https://www.africanews.com/feed/rss · media/corroborated · every 60 min
                - paragraph [ref=e487]: Last attempt never · last success never · next due never · items 0 total, 0 in 24h, 0 ignored
                - paragraph [ref=e488]: "Rights notes: Candidate from 07. Live RSS and usage rights not verified."
                - button "Test fetch" [ref=e492] [cursor=pointer]
                - group [ref=e493]:
                  - generic "Record a rights approval" [ref=e494] [cursor=pointer]
                  - option "Link only" [selected]
                  - option "Metadata only"
                  - option "Permitted excerpt"
                  - option "Licensed full text"
              - region "AllAfrica" [ref=e495]:
                - generic [ref=e496]:
                  - heading "AllAfrica" [level=2] [ref=e497]
                  - generic [ref=e498]: "Rights: pending"
                  - generic [ref=e499]: link_only
                  - generic [ref=e500]: Not fetching
                - paragraph [ref=e501]: https://allafrica.com/tools/headlines/rdf/latest/headlines.rdf · media/discovery · every 60 min
                - paragraph [ref=e502]: Last attempt never · last success never · next due never · items 0 total, 0 in 24h, 0 ignored
                - paragraph [ref=e503]: "Rights notes: Candidate from 07. Syndication/attribution permission not verified."
                - button "Test fetch" [ref=e507] [cursor=pointer]
                - group [ref=e508]:
                  - generic "Record a rights approval" [ref=e509] [cursor=pointer]
                  - option "Link only" [selected]
                  - option "Metadata only"
                  - option "Permitted excerpt"
                  - option "Licensed full text"
              - region "Business Day (South Africa)" [ref=e510]:
                - generic [ref=e511]:
                  - heading "Business Day (South Africa)" [level=2] [ref=e512]
                  - generic [ref=e513]: "Rights: pending"
                  - generic [ref=e514]: link_only
                  - generic [ref=e515]: Not fetching
                - paragraph [ref=e516]: No endpoint · media/corroborated · every 60 min
                - paragraph [ref=e517]: Last attempt never · last success never · next due never · items 0 total, 0 in 24h, 0 ignored
                - paragraph [ref=e518]: "Rights notes: Candidate from 07. Endpoint and licensing not verified."
                - button "Test fetch" [ref=e522] [cursor=pointer]
                - group [ref=e523]:
                  - generic "Record a rights approval" [ref=e524] [cursor=pointer]
                  - option "Link only" [selected]
                  - option "Metadata only"
                  - option "Permitted excerpt"
                  - option "Licensed full text"
              - region "Central Bank of Nigeria" [ref=e525]:
                - generic [ref=e526]:
                  - heading "Central Bank of Nigeria" [level=2] [ref=e527]
                  - generic [ref=e528]: "Rights: pending"
                  - generic [ref=e529]: link_only
                  - generic [ref=e530]: Not fetching
                - paragraph [ref=e531]: No endpoint · official/primary · every 60 min
                - paragraph [ref=e532]: Last attempt never · last success never · next due never · items 0 total, 0 in 24h, 0 ignored
                - paragraph [ref=e533]: "Rights notes: Candidate from 07. Approved announcement access and reuse rules not identified."
                - button "Test fetch" [ref=e537] [cursor=pointer]
                - group [ref=e538]:
                  - generic "Record a rights approval" [ref=e539] [cursor=pointer]
                  - option "Link only" [selected]
                  - option "Metadata only"
                  - option "Permitted excerpt"
                  - option "Licensed full text"
              - region "Fixture Wire (synthetic)" [ref=e540]:
                - generic [ref=e541]:
                  - heading "Fixture Wire (synthetic)" [level=2] [ref=e542]
                  - generic [ref=e543]: "Rights: approved"
                  - generic [ref=e544]: permitted_excerpt
                  - generic [ref=e545]: Not fetching
                  - generic [ref=e546]: fixture
                - paragraph [ref=e547]: https://fixture.example/feed.xml · media/corroborated · every 60 min
                - paragraph [ref=e548]:
                  - text: Last attempt
                  - time [ref=e549]: 3m ago
                  - text: · last success
                  - time [ref=e550]: 3m ago
                  - text: · next due
                  - time [ref=e551]: just now
                  - text: · items 3 total, 3 in 24h, 1 ignored
                - paragraph [ref=e552]:
                  - text: "Rights notes: Synthetic test fixture; not a real publisher. ·"
                  - link "terms" [ref=e553] [cursor=pointer]:
                    - /url: https://fixture.example/terms
                - generic [ref=e554]:
                  - button "Test fetch" [ref=e557] [cursor=pointer]
                  - button "Fetch now" [ref=e560] [cursor=pointer]
                  - button "Enable" [ref=e563] [cursor=pointer]
                  - button "Revoke rights" [ref=e566] [cursor=pointer]
              - region "GSMA Newsroom" [ref=e567]:
                - generic [ref=e568]:
                  - heading "GSMA Newsroom" [level=2] [ref=e569]
                  - generic [ref=e570]: "Rights: pending"
                  - generic [ref=e571]: link_only
                  - generic [ref=e572]: Not fetching
                - paragraph [ref=e573]: No endpoint · media/corroborated · every 60 min
                - paragraph [ref=e574]: Last attempt never · last success never · next due never · items 0 total, 0 in 24h, 0 ignored
                - paragraph [ref=e575]: "Rights notes: Candidate from 07. Feed terms and reuse permission not verified."
                - button "Test fetch" [ref=e579] [cursor=pointer]
                - group [ref=e580]:
                  - generic "Record a rights approval" [ref=e581] [cursor=pointer]
                  - option "Link only" [selected]
                  - option "Metadata only"
                  - option "Permitted excerpt"
                  - option "Licensed full text"
  - region "Notifications alt+T"
  - alert [ref=e582]
  - generic [ref=e583]: low
```

# Test source

```ts
  1   | import { readFileSync, readdirSync } from "node:fs";
  2   | import path from "node:path";
  3   | import { expect, test, type Page } from "@playwright/test";
  4   | import { BASE, noConsentBanner, shotDir, signIn } from "./helpers";
  5   | 
  6   | test.beforeEach(async ({ page }) => noConsentBanner(page));
  7   | 
  8   | async function openDraft(page: Page, text: string) {
  9   |   await page.goto("/admin/editorial?tab=review");
  10  |   await page.getByRole("link", { name: new RegExp(text) }).first().click();
  11  |   await expect(page.getByRole("heading", { name: "Claims and evidence" })).toBeVisible();
  12  | }
  13  | 
  14  | test("T-029 RBAC: member → forbidden; anonymous → sign-in; moderator cannot approve", async ({ page }) => {
  15  |   await page.goto("/admin");
  16  |   await expect(page).toHaveURL(/\/auth\/sign-in\?next=(%2F|\/)admin/);
  17  |   await signIn(page, "reader@palavva.local", BASE, "/admin");
  18  |   await expect(page).toHaveURL(/\/forbidden/);
  19  |   await expect(page.getByRole("heading", { name: "You don't have permission to view this page." })).toBeVisible();
  20  |   const r = await page.request.get("/api/v1/admin/metrics");
  21  |   expect(r.status()).toBe(403);
  22  | });
  23  | 
  24  | test("T-029 Overview shows real, labeled metrics and integration states; screenshots", async ({ page }) => {
  25  |   await signIn(page, "editor@palavva.local", BASE, "/admin");
  26  |   await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
  27  |   // v1.5 visual Command Center (docs/specs/25): the same honest states, now on the workspace that owns them.
  28  |   await expect(page.locator('[data-metric="Real revenue"]')).toContainText("no processor connected");
  29  |   await expect(page.locator('[data-metric="Paid model spend"]')).toContainText("$0.00");
  30  |   await page.goto("/admin/revenue");
  31  |   await expect(page.getByText("EspoCRM: NOT_CONFIGURED")).toBeVisible();
  32  |   await expect(page.getByText("Revive Adserver: NOT_CONFIGURED")).toBeVisible();
  33  |   await page.goto("/admin");
  34  |   for (const [p, name] of [["/admin", "overview"], ["/admin/editorial", "editorial"], ["/admin/sources", "sources"], ["/admin/ai", "ai"], ["/admin/analytics", "analytics"], ["/admin/health", "health"], ["/admin/settings", "settings"], ["/admin/sponsors", "sponsors"]]) {
  35  |     await page.goto(p);
> 36  |     await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      |                                                           ^ Error: expect(locator).toBeVisible() failed
  37  |     await page.screenshot({ path: `${shotDir}/admin-${name}-1440.png`, fullPage: false });
  38  |   }
  39  | });
  40  | 
  41  | test("T-021 revision conflict (409-style) and publishing kill switch", async ({ browser }) => {
  42  |   const a = await (await browser.newContext()).newPage();
  43  |   const b = await (await browser.newContext()).newPage();
  44  |   await signIn(a, "editor@palavva.local", BASE, "/admin/editorial");
  45  |   await signIn(b, "admin@palavva.local", BASE, "/admin/editorial");
  46  |   await openDraft(a, "Fixture");
  47  |   const url = a.url();
  48  |   await b.goto(url);
  49  |   await b.getByLabel("Headline").fill("Fixture draft edited in another tab");
  50  |   await b.getByRole("button", { name: "Save edit" }).click();
  51  |   await expect(b.getByText("Draft updated.")).toBeVisible();
  52  |   a.on("dialog", (d) => d.accept());
  53  |   await a.getByLabel(/Review note/).fill("Trying to approve a stale revision");
  54  |   await a.getByRole("button", { name: "Approve and publish" }).click();
  55  |   await expect(a.getByText(/revision conflict/)).toBeVisible();
  56  |   // Kill switch: pause publishing, approval is blocked, then resume.
  57  |   await b.goto("/admin/settings");
  58  |   const sw = b.getByTestId("switch-PUBLISHING_PAUSED");
  59  |   await sw.getByPlaceholder("Reason (required)").fill("E2E kill-switch drill");
  60  |   await sw.getByRole("button", { name: "Turn on" }).click();
  61  |   await expect(sw).toContainText("ON");
  62  |   await a.goto(url);
  63  |   await expect(a.getByText("Publishing paused for this tenant.")).toBeVisible();
  64  |   await a.getByLabel(/Review note/).fill("Should be blocked while paused");
  65  |   await a.getByRole("button", { name: "Approve and publish" }).click();
  66  |   await expect(a.getByText(/Publishing is paused/)).toBeVisible();
  67  |   await b.goto("/admin/settings");
  68  |   await b.getByTestId("switch-PUBLISHING_PAUSED").getByPlaceholder("Reason (required)").fill("Drill complete");
  69  |   await b.getByTestId("switch-PUBLISHING_PAUSED").getByRole("button", { name: "Turn off" }).click();
  70  |   await expect(b.getByTestId("switch-PUBLISHING_PAUSED")).toContainText("OFF");
  71  | });
  72  | 
  73  | test("T-021/T-022 medium-risk draft: moderator/reviewer limits, flags need a note, editor publishes; AI roles ≤3 go public with it", async ({ browser }) => {
  74  |   const ed = await (await browser.newContext()).newPage();
  75  |   await signIn(ed, "editor@palavva.local", BASE, "/admin/editorial");
  76  |   await openDraft(ed, "Fixture");
  77  |   const head = await ed.getByRole("heading", { level: 1 }).innerText();
  78  |   await expect(ed.getByText(/Risk: (medium|high|low)/)).toBeVisible();
  79  |   await expect(ed.getByText(/AI role contributions \(([0-3])\)/)).toBeVisible();
  80  |   // Publish with an empty note when flags exist is refused; with a note it succeeds.
  81  |   const approve = ed.getByRole("button", { name: "Approve and publish" });
  82  |   ed.on("dialog", (d) => d.accept());
  83  |   const cs = await ed.getByText(/Claim check: /).innerText();
  84  |   if (cs.includes("NEEDS_REVIEW")) {
  85  |     await approve.click();
  86  |     await expect(ed.getByText(/Validation raised flags/)).toBeVisible();
  87  |   }
  88  |   await ed.getByLabel(/Review note/).fill("Checked the fixture claims against the synthetic source; OK for test publication.");
  89  |   await approve.click();
  90  |   await expect(ed.getByRole("link", { name: "View public page" })).toBeVisible();
  91  |   await expect(ed.getByText(/published · created/)).toBeVisible();
  92  |   await ed.getByRole("link", { name: "View public page" }).click();
  93  |   await expect(ed.getByRole("heading", { level: 1 })).toHaveText(head);
  94  |   await expect(ed.getByRole("heading", { name: "Read the sources" })).toBeVisible();
  95  |   const ai = ed.getByTestId("ai-post");
  96  |   expect(await ai.count()).toBeLessThanOrEqual(3);
  97  |   if (await ai.count()) await expect(ai.first()).toContainText("· AI");
  98  |   await ed.screenshot({ path: `${shotDir}/e2e-published-fixture-story-1440.png`, fullPage: true });
  99  | });
  100 | 
  101 | test("T-024 correction: revision bump, public banner, corrections index, OG version", async ({ page }) => {
  102 |   await signIn(page, "editor@palavva.local", BASE, "/admin/editorial?tab=published");
  103 |   await page.getByRole("link", { name: /Fixture/ }).first().click();
  104 |   const rev = Number((await page.locator('input[name="expected_revision"]').first().inputValue()));
  105 |   await page.getByLabel("Headline").fill(`Corrected fixture headline ${Date.now()}`);
  106 |   await page.getByLabel("Correction summary shown to readers").fill("An earlier version misdescribed the fixture source; the headline was corrected.");
  107 |   await page.getByRole("button", { name: "Publish correction" }).click();
  108 |   await expect(page.getByText(/Correction published/)).toBeVisible();
  109 |   await page.reload();
  110 |   expect(Number(await page.locator('input[name="expected_revision"]').first().inputValue())).toBe(rev + 1);
  111 |   await page.getByRole("link", { name: "View public page" }).click();
  112 |   await expect(page.getByRole("note", { name: "Correction" })).toContainText("misdescribed the fixture source");
  113 |   await expect(page.locator('meta[property="og:image"]')).toHaveAttribute("content", new RegExp(`v=${rev + 1}`));
  114 |   await page.goto("/corrections");
  115 |   await expect(page.getByText("misdescribed the fixture source").first()).toBeVisible();
  116 | });
  117 | 
  118 | test("T-013 rights: pending source test-fetch makes no network request; revoke holds drafts", async ({ page }) => {
  119 |   await signIn(page, "admin@palavva.local", BASE, "/admin/sources");
  120 |   const pending = page.getByTestId("source-row").filter({ hasText: "AllAfrica" });
  121 |   await pending.getByRole("button", { name: "Test fetch" }).click();
  122 |   await expect(pending.getByText("Rights not approved: no network request was made.")).toBeVisible();
  123 |   await expect(pending.getByRole("button", { name: "Fetch now" })).toHaveCount(0);
  124 | });
  125 | 
  126 | test("T-030 sponsor inquiry: durable reference, honest NOT_CONFIGURED forward state", async ({ page }) => {
  127 |   await page.goto("/advertise");
  128 |   await page.getByLabel("Your name").fill("Ada Test");
  129 |   await page.getByLabel("Work email").fill("ada@business.test");
  130 |   await page.getByLabel("Business or organization").fill("Test Solar Ltd");
  131 |   await page.getByLabel("Country/region").selectOption("Kenya");
  132 |   await page.getByLabel("Industry").selectOption("Energy & Climate");
  133 |   await page.getByLabel(/I agree to be contacted/).check();
  134 |   await page.getByRole("button", { name: "Send inquiry" }).click();
  135 |   const ok = page.getByTestId("inquiry-success");
  136 |   await expect(ok).toContainText(/Reference: PV-\d{8}-[0-9A-F]{6}/);
```