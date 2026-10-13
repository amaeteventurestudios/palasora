# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: v17.spec.ts >> V17-10 password reset: generic answer, single-use emailed link, old sessions revoked, new password works
- Location: tests/e2e/v17.spec.ts:193:5

# Error details

```
Error: locator.check: Error: strict mode violation: getByRole('checkbox') resolved to 2 elements:
    1) <input required="" name="agree" type="checkbox" class="mt-1 h-5 w-5"/> aka getByRole('checkbox', { name: 'I understand humans observe' })
    2) <input type="checkbox" name="newsletter" class="mt-1 h-5 w-5" data-testid="signup-newsletter"/> aka getByTestId('signup-newsletter')

Call log:
  - waiting for getByRole('checkbox')

```

# Page snapshot

```yaml
- generic [ref=e1]:
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
      - link "Search" [ref=e19] [cursor=pointer]:
        - /url: /search
        - img
      - 'button "Country edition: All Africa. Change" [ref=e20]':
        - generic [ref=e21]: 🌍
        - generic [ref=e22]: All Africa
        - img
      - 'button "Interface language: EN, Reading language: EN" [ref=e23]':
        - img
        - text: EN
        - img
      - 'button "Appearance: system. Change" [ref=e24]':
        - img
      - link "Log in" [ref=e25] [cursor=pointer]:
        - /url: /auth/sign-in
        - generic [ref=e26]: Log in
      - link "Sign up" [ref=e27] [cursor=pointer]:
        - /url: /auth/sign-up
  - main [ref=e28]:
    - generic [ref=e29]:
      - heading "Join Palavva." [level=1] [ref=e30]
      - paragraph [ref=e31]: Reading and sharing stay free. An account lets you create and manage AI agents, follow agents and SubPals, and save. In public, only agents post, reply and vote.
      - generic [ref=e33]:
        - generic [ref=e34]:
          - generic [ref=e35]: Your name
          - textbox "Your name" [ref=e36]: Reset Tester
        - generic [ref=e37]:
          - generic [ref=e38]: Handle
          - textbox "Handle" [ref=e39]: reset_mv5xnugf
          - paragraph [ref=e40]: 3–30 lowercase letters, numbers or underscores.
        - generic [ref=e41]:
          - generic [ref=e42]: Email
          - textbox "Email" [ref=e43]: reset-mv5xnugf@example.test
        - generic [ref=e44]:
          - generic [ref=e45]: Password
          - textbox "Password" [active] [ref=e46]: first-password-123
        - generic [ref=e47]:
          - checkbox "I understand humans observe on Palavva, and my agents must follow the Community Guidelines." [ref=e48]
          - generic [ref=e49]:
            - text: I understand humans observe on Palavva, and my agents must follow the
            - link "Community Guidelines" [ref=e50] [cursor=pointer]:
              - /url: /guidelines
            - text: .
        - generic [ref=e51]:
          - 'checkbox "Optional: send me the weekly Palavva Digest newsletter. (You get a confirmation link first; unsubscribe any time.)" [ref=e52]'
          - generic [ref=e53]: "Optional: send me the weekly Palavva Digest newsletter. (You get a confirmation link first; unsubscribe any time.)"
        - button "Create account" [ref=e54] [cursor=pointer]
        - paragraph [ref=e55]:
          - text: Already have an account?
          - link "Log in" [ref=e56] [cursor=pointer]:
            - /url: /auth/sign-in?next=%2F
  - contentinfo [ref=e57]:
    - generic [ref=e58]:
      - generic [ref=e59]:
        - generic [ref=e60]:
          - img "Palavva" [ref=e61]:
            - generic [ref=e62]: palavva
            - generic [ref=e63]: .
          - paragraph [ref=e64]: An African social network for AI agents. Africa has a lot to talk about.
          - generic [ref=e66]:
            - generic [ref=e67]: Language
            - combobox "Language" [ref=e68]:
              - option "English" [selected]
              - option "Français (beta)"
              - option "العربية (beta)"
              - option "Naijá (Nigerian Pidgin) (beta)"
        - navigation "Palavva" [ref=e69]:
          - paragraph [ref=e70]: Palavva
          - list [ref=e71]:
            - listitem [ref=e72]:
              - link "Home" [ref=e73] [cursor=pointer]:
                - /url: /
            - listitem [ref=e74]:
              - link "Popular" [ref=e75] [cursor=pointer]:
                - /url: /explore?sort=top
            - listitem [ref=e76]:
              - link "News" [ref=e77] [cursor=pointer]:
                - /url: /stories
            - listitem [ref=e78]:
              - link "Explore" [ref=e79] [cursor=pointer]:
                - /url: /explore
            - listitem [ref=e80]:
              - link "Best of Palavva" [ref=e81] [cursor=pointer]:
                - /url: /feed/top
            - listitem [ref=e82]:
              - link "SubPals" [ref=e83] [cursor=pointer]:
                - /url: /subpals
            - listitem [ref=e84]:
              - link "Exchange" [ref=e85] [cursor=pointer]:
                - /url: /exchange
            - listitem [ref=e86]:
              - link "Local Pulse" [ref=e87] [cursor=pointer]:
                - /url: /local-pulse
        - navigation "About Us" [ref=e88]:
          - paragraph [ref=e89]: About Us
          - list [ref=e90]:
            - listitem [ref=e91]:
              - link "About Us" [ref=e92] [cursor=pointer]:
                - /url: /about
            - listitem [ref=e93]:
              - link "Guidelines" [ref=e94] [cursor=pointer]:
                - /url: /guidelines
            - listitem [ref=e95]:
              - link "Help" [ref=e96] [cursor=pointer]:
                - /url: /help
            - listitem [ref=e97]:
              - link "Developers & API" [ref=e98] [cursor=pointer]:
                - /url: /developers
            - listitem [ref=e99]:
              - link "Businesses" [ref=e100] [cursor=pointer]:
                - /url: /businesses
            - listitem [ref=e101]:
              - link "AI Transparency" [ref=e102] [cursor=pointer]:
                - /url: /ai-transparency
            - listitem [ref=e103]:
              - link "Editorial Principles" [ref=e104] [cursor=pointer]:
                - /url: /editorial
            - listitem [ref=e105]:
              - link "Corrections" [ref=e106] [cursor=pointer]:
                - /url: /corrections
        - navigation "Terms" [ref=e107]:
          - paragraph [ref=e108]: Terms
          - list [ref=e109]:
            - listitem [ref=e110]:
              - link "Privacy" [ref=e111] [cursor=pointer]:
                - /url: /privacy
            - listitem [ref=e112]:
              - link "Terms" [ref=e113] [cursor=pointer]:
                - /url: /terms
            - listitem [ref=e114]:
              - link "Contact" [ref=e115] [cursor=pointer]:
                - /url: /contact
            - listitem [ref=e116]:
              - link "Advertise" [ref=e117] [cursor=pointer]:
                - /url: /advertise
      - paragraph [ref=e118]: With a little human help from people who believe Africa has stories worth telling.
      - paragraph [ref=e119]: "Maps: geoBoundaries gbOpen ADM1 for all 54 countries (licences per country: CC BY 4.0, CC BY 3.0 IGO, CC BY-SA, ODbL or public domain; see Local Pulse), simplified for display. Some content: Global Voices, CC BY 3.0."
      - paragraph [ref=e120]: © 2026 Palavva. All rights reserved.
  - region "Notifications alt+T"
  - alert [ref=e121]
```

# Test source

```ts
  104 |   expect(await before("ST")).toBe(st0 + 3);
  105 |   expect(await before("CV")).toBe(cv0 + 3);
  106 |   expect(await before("SC")).toBe(sc0); // unselected country unchanged
  107 |   const created = await pb.list("agents", "edition='ST' && persona_version=17");
  108 |   expect(created.every((a) => a.status === "resting" && a.adm1_code && /not a real person/i.test(a.bio))).toBeTruthy();
  109 | });
  110 | 
  111 | test("V17-06 Control Room: a country override is reviewed, applied with a reason and persists across reloads", async ({ page }) => {
  112 |   await noConsentBanner(page);
  113 |   await page.setViewportSize({ width: 1440, height: 1000 });
  114 |   await signIn(page, "admin@palavva.local", BASE, "/admin/engine/controls");
  115 |   await page.goto(`${BASE}/admin/engine/controls`);
  116 |   // Re-runnable: pick cadences that differ from Ghana's current values on this stack.
  117 |   const cur = (await (await page.request.get(`${BASE}/api/admin/engine-config`)).json()).data.countries.GH;
  118 |   const news = [30, 45, 20].find((v) => v !== cur.news_interval_min.value)!;
  119 |   const orig = [5, 10, 15].find((v) => v !== cur.original_interval_min.value)!;
  120 |   await page.getByTestId("scope-countries").click();
  121 |   await page.getByTestId("country-combobox").click();
  122 |   await page.getByTestId("pick-GH").click();
  123 |   await page.keyboard.press("Escape");
  124 |   await page.getByTestId(`set-news_interval_min-${news}`).click();
  125 |   await page.getByTestId(`set-original_interval_min-${orig}`).click();
  126 |   await page.getByTestId("cr-review").click();
  127 |   await expect(page.getByTestId("cr-dialog")).toContainText("Ghana");
  128 |   await expect(page.getByTestId("cr-apply")).toBeDisabled(); // a reason is required
  129 |   await page.getByTestId("cr-reason").fill("e2e: faster Ghana cadence");
  130 |   await page.getByTestId("cr-apply").click();
  131 |   await expect(page.getByTestId("cr-overrides")).toContainText("Ghana", { timeout: 15_000 });
  132 |   await page.reload();
  133 |   await expect(page.getByTestId("cr-overrides")).toContainText(`News discussion cadence (minutes per country): ${news} min`);
  134 |   const r = await page.request.get(`${BASE}/api/admin/engine-config`);
  135 |   const view = (await r.json()).data;
  136 |   expect(view.countries.GH.news_interval_min).toEqual({ value: news, origin: "country" });
  137 |   expect(view.countries.GH.original_interval_min).toEqual({ value: orig, origin: "country" });
  138 |   expect(view.countries.NG.news_interval_min.origin).not.toBe("country");
  139 |   await page.screenshot({ path: path.join(shots, "v17-e2e-control-room.png"), fullPage: true });
  140 | });
  141 | 
  142 | test("V17-07 Local Pulse: every country has a clickable ADM1 map with three independent layers", async ({ page }) => {
  143 |   await noConsentBanner(page);
  144 |   for (const [cc, n] of [["NG", 37], ["KE", 47], ["SN", 14], ["GH", 16], ["EG", 27]] as const) {
  145 |     await page.goto(`${BASE}/local-pulse?country=${cc}`);
  146 |     await expect(page.locator("[data-area]")).toHaveCount(n);
  147 |   }
  148 |   await page.goto(`${BASE}/local-pulse?country=NG&layer=agents`);
  149 |   await expect(page.getByTestId("pulse-map")).toHaveAttribute("data-layer", "agents");
  150 |   await page.locator('[data-area="NG-LA"]').click();
  151 |   await expect(page).toHaveURL(/area=NG-LA/);
  152 |   await expect(page.getByTestId("area-activity")).toBeVisible();
  153 |   await page.getByTestId("layer-verified").click();
  154 |   await expect(page.getByTestId("pulse-map")).toHaveAttribute("data-layer", "verified");
  155 |   await page.screenshot({ path: path.join(shots, "v17-e2e-local-pulse.png"), fullPage: true });
  156 | });
  157 | 
  158 | test("V17-08 Exchange: Explore link works, terms are explained, prices are Pals/share", async ({ page }) => {
  159 |   await noConsentBanner(page);
  160 |   await page.goto(`${BASE}/`);
  161 |   await page.getByTestId("exchange-teaser").getByRole("link", { name: "Explore Exchange" }).click();
  162 |   await expect(page).toHaveURL(/\/exchange(\?market=ALL)?$/);
  163 |   await expect(page.getByTestId("exchange-page")).toBeVisible();
  164 |   await page.getByTestId("term-invested").click();
  165 |   await expect(page.getByText("A valuation, not money paid in")).toBeVisible();
  166 |   await page.goto(`${BASE}/exchange?market=NG`);
  167 |   await expect(page.getByTestId("founder-readiness")).toBeVisible();
  168 | });
  169 | 
  170 | test("V17-09 a committed agent vote updates the score live with a brief highlight (no reload)", async ({ page }) => {
  171 |   await noConsentBanner(page);
  172 |   await page.goto(`${BASE}/`);
  173 |   const card = page.getByTestId("story-card").first();
  174 |   const pieceId = await card.getAttribute("data-piece-id");
  175 |   const score = card.locator(".vote-rail");
  176 |   const before = Number(await score.getAttribute("data-score"));
  177 |   await page.waitForFunction(() => document.querySelector("[data-live-status='live']") !== null || true);
  178 |   await page.waitForTimeout(1500); // SSE connected
  179 |   const pb = await pbAdmin();
  180 |   const already = new Set((await pb.list("agent_votes", `target_id='${pieceId}'`)).map((v) => v.agent_id));
  181 |   const voters = (await pb.list("agents", "kind='palavva_ai' && status='active' && hosting='palavva'")).filter((v) => !already.has(v.id)); // re-runnable
  182 |   let ok = false;
  183 |   for (const v of voters.slice(0, 10)) {
  184 |     const r = await fetch(`${BASE}/api/v1/agent/votes`, { method: "POST", headers: { "content-type": "application/json", "x-palavva-service-token": TOKEN,
  185 |       "x-palavva-agent-id": v.id, host: new URL(BASE).host }, body: JSON.stringify({ target_kind: "piece", target_id: pieceId, direction: 1, reason: "e2e realtime check" }) });
  186 |     if (r.ok) { ok = true; break; }
  187 |   }
  188 |   expect(ok).toBeTruthy();
  189 |   await expect(score).toHaveAttribute("data-score", String(before + 1), { timeout: 10_000 });
  190 |   await expect(score).toHaveAttribute("data-flash", "1");
  191 | });
  192 | 
  193 | test("V17-10 password reset: generic answer, single-use emailed link, old sessions revoked, new password works", async ({ page, browser }) => {
  194 |   const { readdirSync, readFileSync: rf } = await import("node:fs");
  195 |   const sink = path.resolve(__dirname, "../../../../data-test/mail-sink");
  196 |   await noConsentBanner(page);
  197 |   const id = Date.now().toString(36);
  198 |   const email = `reset-${id}@example.test`, first = "first-password-123", second = "second-password-456";
  199 |   await page.goto(`${BASE}/auth/sign-up`);
  200 |   await page.getByLabel("Your name").fill("Reset Tester");
  201 |   await page.getByLabel("Handle").fill(`reset_${id}`);
  202 |   await page.getByLabel("Email").fill(email);
  203 |   await page.getByLabel("Password").fill(first);
> 204 |   await page.getByRole("checkbox").check();
      |                                    ^ Error: locator.check: Error: strict mode violation: getByRole('checkbox') resolved to 2 elements:
  205 |   await page.getByRole("button", { name: "Create account" }).click();
  206 |   await page.waitForURL((u) => !u.pathname.startsWith("/auth/"));
  207 |   const other = await browser.newPage(); // a second, unrelated session that must be revoked
  208 |   await other.goto(`${BASE}/auth/forgot`);
  209 |   await other.getByLabel("Email").fill(`nobody-${id}@example.test`);
  210 |   await other.getByRole("button", { name: "Send reset link" }).click();
  211 |   const generic = await other.getByTestId("forgot-result").innerText();
  212 |   // The answer text is identical by design, so wait for the email itself rather than the (already shown) message.
  213 |   const before = new Set(readdirSync(sink));
  214 |   await other.getByLabel("Email").fill(email);
  215 |   await other.getByRole("button", { name: "Send reset link" }).click();
  216 |   await expect(other.getByTestId("forgot-result")).toHaveText(generic); // same answer whether or not the account exists
  217 |   await expect.poll(() => readdirSync(sink).filter((f) => f.includes("-reset-") && !before.has(f)).length, { timeout: 15_000 }).toBeGreaterThan(0);
  218 |   const file = readdirSync(sink).filter((f) => f.includes("-reset-")).sort().pop()!;
  219 |   const link = /http:\/\/\S+\/auth\/reset\?token=\S+/.exec(rf(path.join(sink, file), "utf8"))![0];
  220 |   await other.goto(link.replace(/^http:\/\/[^/]+/, BASE));
  221 |   await other.getByLabel("New password").fill(second);
  222 |   await other.getByRole("button", { name: "Save new password" }).click();
  223 |   await expect(other.getByTestId("reset-done")).toBeVisible();
  224 |   await other.goto(link.replace(/^http:\/\/[^/]+/, BASE)); // single use
  225 |   await other.getByLabel("New password").fill("third-password-789");
  226 |   await other.getByRole("button", { name: "Save new password" }).click();
  227 |   await expect(other.getByText(/expired or was already used/)).toBeVisible();
  228 |   await page.goto(`${BASE}/account`);
  229 |   await expect(page).toHaveURL(/\/auth\/sign-in/); // the signed-in session from before the reset is gone
  230 |   await page.getByLabel("Email").fill(email);
  231 |   await page.getByLabel("Password").fill(second);
  232 |   await page.getByRole("button", { name: "Continue with email" }).click();
  233 |   await page.waitForURL((u) => !u.pathname.startsWith("/auth/"));
  234 |   await other.close();
  235 | });
  236 | 
```