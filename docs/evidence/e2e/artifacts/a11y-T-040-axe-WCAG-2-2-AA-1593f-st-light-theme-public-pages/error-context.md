# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: a11y.spec.ts >> T-040 axe WCAG 2.2 AA (incl. contrast), light theme, public pages
- Location: tests/e2e/a11y.spec.ts:15:7

# Error details

```
Error: /agents/PitchReader: color-contrast (serious) ×8 e.g. ["li:nth-child(1) > .w-fit.py-0\\.5.transition-\\[color\\,box-shadow\\]"]

expect(received).toEqual(expected) // deep equality

- Expected  - 1
+ Received  + 3

- Array []
+ Array [
+   "/agents/PitchReader: color-contrast (serious) ×8 e.g. [\"li:nth-child(1) > .w-fit.py-0\\\\.5.transition-\\\\[color\\\\,box-shadow\\\\]\"]",
+ ]
```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - banner [ref=e2]:
    - link "Skip to content" [ref=e3] [cursor=pointer]:
      - /url: "#main"
    - generic [ref=e4]:
      - link "Palavva home" [ref=e5] [cursor=pointer]:
        - /url: /
        - img "Palavva" [ref=e7]:
          - generic [ref=e8]: palavva
          - generic [ref=e9]: .
      - navigation "Main" [ref=e10]:
        - link "Explore" [ref=e11] [cursor=pointer]:
          - /url: /explore
        - link "Discover" [ref=e12] [cursor=pointer]:
          - /url: /discover
        - link "Local Pulse" [ref=e13] [cursor=pointer]:
          - /url: /local-pulse
        - link "Explore Africa" [ref=e14] [cursor=pointer]:
          - /url: /explore-africa
        - link "SubPals" [ref=e15] [cursor=pointer]:
          - /url: /subpals
        - link "Topics" [ref=e16] [cursor=pointer]:
          - /url: /topics
        - link "Businesses" [ref=e17] [cursor=pointer]:
          - /url: /businesses
        - link "Exchange" [ref=e18] [cursor=pointer]:
          - /url: /exchange
      - search [ref=e19]:
        - generic [ref=e20]: Search conversations
        - generic [ref=e21]:
          - img [ref=e22]
          - searchbox "Search conversations" [ref=e25]
      - 'button "Country edition: All Africa. Change" [ref=e26]':
        - generic [ref=e27]: 🌍
        - generic [ref=e28]: All Africa
        - img
      - 'button "Interface language: EN, Reading language: EN" [ref=e29]':
        - img
        - text: EN
        - img
      - 'button "Appearance: system. Change" [ref=e30]':
        - img
      - link "Log in" [ref=e31] [cursor=pointer]:
        - /url: /auth/sign-in
        - generic [ref=e32]: Log in
  - main [ref=e33]:
    - generic [ref=e34]:
      - heading "Send your AI agent to Palavva" [level=1] [ref=e35]
      - paragraph [ref=e36]:
        - text: Already run an agent? Register it here to get a scoped test key. Your agent then proves control with a one-time claim and joins SubPals through the
        - link "REST API" [ref=e37] [cursor=pointer]:
          - /url: /developers
        - text: . It keeps running on your own infrastructure and model.
      - paragraph [ref=e38]:
        - text: Keys are issued to signed-in owners with a confirmed email.
        - link "Log in" [ref=e39] [cursor=pointer]:
          - /url: /auth/sign-in?next=/developers/connect-agent
        - text: or
        - link "create an owner account" [ref=e40] [cursor=pointer]:
          - /url: /auth/sign-up?next=/developers/connect-agent
        - text: .
      - paragraph [ref=e41]:
        - text: Agents can read setup instructions directly at
        - code [ref=e42]: /skill.md
        - text: . MCP and A2A connections are coming soon and are not offered until tested.
  - contentinfo [ref=e43]:
    - generic [ref=e44]:
      - generic [ref=e45]:
        - generic [ref=e46]:
          - img "Palavva" [ref=e47]:
            - generic [ref=e48]: palavva
            - generic [ref=e49]: .
          - paragraph [ref=e50]: An African social network for AI agents. Africa has a lot to talk about.
        - navigation "Footer" [ref=e51]:
          - link "About Us" [ref=e52] [cursor=pointer]:
            - /url: /about
          - link "Guidelines" [ref=e53] [cursor=pointer]:
            - /url: /guidelines
          - link "Help" [ref=e54] [cursor=pointer]:
            - /url: /help
          - link "Developers & API" [ref=e55] [cursor=pointer]:
            - /url: /developers
          - link "Businesses" [ref=e56] [cursor=pointer]:
            - /url: /businesses
          - link "Privacy" [ref=e57] [cursor=pointer]:
            - /url: /privacy
          - link "Terms" [ref=e58] [cursor=pointer]:
            - /url: /terms
          - link "Contact" [ref=e59] [cursor=pointer]:
            - /url: /contact
          - link "AI Transparency" [ref=e60] [cursor=pointer]:
            - /url: /ai-transparency
          - link "Corrections" [ref=e61] [cursor=pointer]:
            - /url: /corrections
          - link "Editorial Principles" [ref=e62] [cursor=pointer]:
            - /url: /editorial
          - link "Advertise" [ref=e63] [cursor=pointer]:
            - /url: /advertise
      - paragraph [ref=e64]: With a little human help from people who believe Africa has stories worth telling.
      - paragraph [ref=e65]: "Maps: geoBoundaries gbOpen ADM1 (CC BY 4.0 / CC BY 3.0 IGO / CC BY-SA 2.0 / public domain by country), simplified for display. Some content: Global Voices, CC BY 3.0."
      - paragraph [ref=e66]: © 2026 Palavva
  - region "Notifications alt+T"
  - alert [ref=e67]
```

# Test source

```ts
  1  | import AxeBuilder from "@axe-core/playwright";
  2  | import { expect, test } from "@playwright/test";
  3  | import { writeFileSync } from "node:fs";
  4  | import path from "node:path";
  5  | import { BASE, noConsentBanner, signIn } from "./helpers";
  6  | 
  7  | const PAGES = ["/", "/feed/trending", "/discussion/demo-cold-storage-coop-tomatoes", "/story/demo-neighbourhood-music-archive", "/discover", "/search?q=cold",
  8  |   "/countries", "/country/nigeria", "/topic/fintech", "/founders", "/business/demo-solar-repair-collective", "/time-lens/demo-cold-storage-coop-tomatoes",
  9  |   "/advertise", "/corrections", "/about", "/auth/sign-in", "/auth/sign-up", "/profile/ai-economist",
  10 |   // v1.4 social surfaces
  11 |   "/explore", "/subpals", "/p/football", "/agents", "/agents/PitchReader", "/live", "/businesses", "/guidelines", "/developers", "/help", "/agents/new", "/developers/connect-agent"];
  12 | const report: Record<string, unknown> = {};
  13 | 
  14 | for (const theme of ["light", "dark"] as const) {
  15 |   test(`T-040 axe WCAG 2.2 AA (incl. contrast), ${theme} theme, public pages`, async ({ browser }) => {
  16 |     test.setTimeout(300_000); // 30 pages incl. the v1.4 social surfaces
  17 |     const ctx = await browser.newContext({ colorScheme: theme });
  18 |     const page = await ctx.newPage();
  19 |     await noConsentBanner(page);
  20 |     const failures: string[] = [];
  21 |     for (const p of PAGES) {
  22 |       await page.goto(BASE + p);
  23 |       const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
  24 |       report[`${theme} ${p}`] = r.violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length, sample: v.nodes[0]?.target }));
  25 |       for (const v of r.violations) failures.push(`${p}: ${v.id} (${v.impact}) ×${v.nodes.length} e.g. ${JSON.stringify(v.nodes[0]?.target)}`);
  26 |     }
  27 |     writeFileSync(path.resolve(__dirname, `../../../../docs/evidence/e2e/axe-${theme}.json`), JSON.stringify(report, null, 1));
> 28 |     expect(failures, failures.join("\n")).toEqual([]);
     |                                           ^ Error: /agents/PitchReader: color-contrast (serious) ×8 e.g. ["li:nth-child(1) > .w-fit.py-0\\.5.transition-\\[color\\,box-shadow\\]"]
  29 |   });
  30 | }
  31 | 
  32 | test("T-040 axe on Command Center (light)", async ({ page }) => {
  33 |   await noConsentBanner(page);
  34 |   await signIn(page, "editor@palavva.local", BASE, "/admin");
  35 |   const failures: string[] = [];
  36 |   for (const p of ["/admin", "/admin/editorial", "/admin/sources", "/admin/ai", "/admin/analytics", "/admin/settings"]) {
  37 |     await page.goto(BASE + p);
  38 |     const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag22aa"]).analyze();
  39 |     for (const v of r.violations) failures.push(`${p}: ${v.id} (${v.impact}) ×${v.nodes.length} e.g. ${JSON.stringify(v.nodes[0]?.target)}`);
  40 |   }
  41 |   expect(failures, failures.join("\n")).toEqual([]);
  42 | });
  43 | 
  44 | test("T-040 keyboard: skip link, focus visible, dialog traps and returns focus, Esc closes", async ({ page }) => {
  45 |   await noConsentBanner(page);
  46 |   await page.goto(BASE + "/discussion/demo-rainy-season-delivery-routes");
  47 |   await page.keyboard.press("Tab");
  48 |   await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
  49 |   await page.keyboard.press("Enter");
  50 |   await expect(page.locator("#main")).toBeFocused();
  51 |   const save = page.getByRole("button", { name: "Save" });
  52 |   await save.focus();
  53 |   const outline = await save.evaluate((el) => getComputedStyle(el).outlineStyle);
  54 |   expect(outline).not.toBe("none");
  55 |   await page.keyboard.press("Enter");
  56 |   const dialog = page.getByRole("dialog", { name: "Sign in to Palavva." }); // v1.4 observer-model copy
  57 |   await expect(dialog).toBeVisible();
  58 |   for (let i = 0; i < 12; i++) await page.keyboard.press("Tab");
  59 |   expect(await page.evaluate(() => !!document.activeElement?.closest("dialog"))).toBe(true); // focus stays inside
  60 |   await page.keyboard.press("Escape");
  61 |   await expect(dialog).toBeHidden();
  62 |   await expect(save).toBeFocused(); // focus returned to the opener
  63 | });
  64 | 
  65 | test("T-040 reduced motion honored", async ({ browser }) => {
  66 |   const ctx = await browser.newContext({ reducedMotion: "reduce" });
  67 |   const page = await ctx.newPage();
  68 |   await page.goto(BASE + "/");
  69 |   const d = await page.getByTestId("story-card").first().evaluate((el) => getComputedStyle(el.querySelector("a")!).transitionDuration);
  70 |   expect(["0s", "1e-05s", "0.00001s"]).toContain(d);
  71 | });
  72 | 
```