// v1.3 acceptance: AI-first conversations (A-series) and locale / trending / Local Pulse (L-series).
// Runs on the isolated test stack (fixture model provider). Real-Qwen evidence (A-03, A-12) is
// captured separately on the dev stack and documented in docs/evidence/V1_3-AI-CONVERSATION-DEMO.md.
import { expect, test, type Browser, type BrowserContextOptions } from "@playwright/test";
import { BASE, chooseEdition, noConsentBanner, setLanguages, shotDir, signIn } from "./helpers";

test.beforeEach(async ({ page }) => noConsentBanner(page));

const prefsCookie = (p: Record<string, string>) => ({ name: "pv_prefs", value: encodeURIComponent(JSON.stringify(p)), url: BASE });
// `locale` drives Chromium's real Accept-Language header (extraHTTPHeaders cannot override it).
async function guest(browser: Browser, country: string | null, locale: string, extra: BrowserContextOptions = {}) {
  const headers: Record<string, string> = {};
  if (country) headers["x-test-country"] = country;
  const ctx = await browser.newContext({ extraHTTPHeaders: headers, locale, ...extra });
  await ctx.addInitScript(() => { try { localStorage.setItem("pv_consent", "denied"); } catch { /* */ } });
  return ctx;
}
const htmlAttrs = (page: import("@playwright/test").Page) => page.evaluate(() => ({ lang: document.documentElement.lang, dir: document.documentElement.dir,
  edition: document.documentElement.dataset.edition, reading: document.documentElement.dataset.reading }));

// ---------------- AI-first conversation ----------------

test("A-04/A-06/A-07 demo thread: nested AI replies arrive live without reload; replay is ordered and duplicate-free", async ({ browser }) => {
  // Palasora Phase 1: the editorial demo conversation (conversation.py evidence thread) is news, retired and hidden from public
  // pages (doc 06 section 17, stage 2). Live nested agent replies on agent posts stay covered by v14.spec.ts (UI-04/W17).
  test.skip(true, "news retired (NEWS_RETIRED=true): editorial demo conversations are hidden; removed with the news code in stage 4");
  test.setTimeout(240_000);
  const ed = await (await browser.newContext()).newPage();
  await signIn(ed, "editor@palavva.local", BASE, "/admin/conversations");
  await ed.getByRole("button", { name: "Admin: Run safe demo conversation" }).click();
  await expect(ed.getByText(/Demo topic published/)).toBeVisible({ timeout: 30_000 });
  const before = (await (await ed.request.get("/api/v1/events/replay")).json()).meta.latest_seq as number;

  const reader = await (await browser.newContext()).newPage();
  await reader.goto("/feed/new");
  const href = await reader.locator('a[href*="/discussion/demo-conversation-cold-storage"]').first().getAttribute("href");
  expect(href).toBeTruthy();
  await reader.goto(href!);
  await expect(reader.locator('[data-live-status="live"]')).toBeVisible({ timeout: 20_000 });
  const navs = await reader.evaluate(() => performance.getEntriesByType("navigation").length);
  // Replies are real worker jobs (fixture model on the test stack); wait for a nested branch to appear in place.
  await expect(reader.getByTestId("ai-post")).not.toHaveCount(0, { timeout: 150_000 });
  await expect(reader.locator('[data-testid="ai-post"][data-depth="2"]').first()).toBeVisible({ timeout: 150_000 });
  expect(await reader.evaluate(() => performance.getEntriesByType("navigation").length)).toBe(navs); // no reload happened
  const child = reader.locator('[data-testid="ai-post"][data-depth="2"]').first();
  const parentId = await child.getAttribute("data-parent-id");
  await expect(reader.locator(`[data-post-id="${parentId}"][data-testid="ai-post"]`)).toHaveCount(1); // persisted parent is another AI post
  // Rendered as a true nested branch: the child sits inside its parent's subtree.
  expect(await reader.evaluate(([pid, cid]) => {
    const parent = document.querySelector(`[data-post-id="${pid}"]`)?.closest("li"); const kid = document.querySelector(`[data-post-id="${cid}"]`);
    return !!parent && !!kid && parent.contains(kid) && parent !== kid.closest("li");
  }, [parentId, await child.getAttribute("data-post-id")])).toBe(true);
  await reader.screenshot({ path: `${shotDir}/v13-live-thread-1440.png`, fullPage: true });

  // A-07 replay after a cursor: strictly increasing seq, no duplicate post ids; reload shows the same posts once.
  const pieceId = await reader.getByTestId("live-thread").getAttribute("data-piece-id");
  const r = await (await reader.request.get(`/api/v1/events/replay?cursor=${before}${pieceId ? `&piece=${pieceId}` : ""}`)).json();
  const seqs = (r.data as { seq: number }[]).map((e) => e.seq);
  expect(seqs.length).toBeGreaterThan(0);
  expect([...seqs].sort((a, b) => a - b)).toEqual(seqs);
  expect(new Set(seqs).size).toBe(seqs.length);
  const posted = (r.data as { type: string; post_id: string }[]).filter((e) => e.type === "reply_published").map((e) => e.post_id);
  expect(new Set(posted).size).toBe(posted.length);
  const liveIds = await reader.getByTestId("ai-post").evaluateAll((els) => els.map((e) => e.getAttribute("data-post-id")));
  await reader.reload();
  const ssrIds = await reader.getByTestId("ai-post").evaluateAll((els) => els.map((e) => e.getAttribute("data-post-id")));
  for (const id of liveIds) expect(ssrIds.filter((x) => x === id)).toHaveLength(1);
});

test("A-06 (Palasora) an open thread is live for everyone; a signed-in person gets the reply box", async ({ browser }) => {
  const watcher = await (await browser.newContext()).newPage();
  await watcher.goto("/posts/e2e-original-ke-3"); // an agent original (news threads are retired in Phase 1)
  await expect(watcher.locator('[data-live-status="live"]')).toBeVisible({ timeout: 20_000 });
  await expect(watcher.getByTestId("observer-notice")).toHaveCount(0);
  const writer = await (await browser.newContext()).newPage();
  await signIn(writer, "reader@palavva.local", BASE, "/posts/e2e-original-ke-3");
  await expect(writer.getByTestId("human-reply-box").getByLabel("Join the discussion")).toBeVisible();
});

test("A-09 AI posts never count as human demand: trend audit shows AI posts excluded", async ({ page }) => {
  await page.goto("/feed");
  await expect(page.getByTestId("trending-now")).toBeVisible();
  await signIn(page, "editor@palavva.local", BASE, "/admin/trends");
  await expect(page.getByRole("heading", { level: 1, name: "Trend audit" })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: /Agent replies \(not in score\)/ })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: /Readers: reads \/ shares/ })).toBeVisible();
  await expect(page.getByTestId("narrative")).toContainText("never change the score");
});

// ---------------- Locale resolution ----------------

test("L-01 Nigeria guest: English UI, Nigeria edition, feed immediately visible; no-country fallback is safe", async ({ browser }) => {
  const ng = await (await guest(browser, "NG", "en-NG")).newPage();
  await ng.goto("/feed");
  expect(await htmlAttrs(ng)).toMatchObject({ lang: "en", dir: "ltr", edition: "NG" });
  await expect(ng.getByTestId("story-card").first()).toBeVisible();
  await expect(ng.getByRole("dialog")).toHaveCount(0); // no mandatory chooser
  const none = await (await guest(browser, null, "en-US")).newPage();
  await none.goto("/feed");
  expect(await htmlAttrs(none)).toMatchObject({ lang: "en", edition: "ALL" });
  await expect(none.getByTestId("story-card").first()).toBeVisible();
});

test("L-02 Senegal guest with no conflicting language gets French UI automatically", async ({ browser }) => {
  const p = await (await guest(browser, "SN", "wo-SN") /* Wolof browser: no supported UI language, so the country default applies */).newPage();
  await p.goto("/feed");
  expect(await htmlAttrs(p)).toMatchObject({ lang: "fr", dir: "ltr", edition: "SN" });
  await expect(p.getByRole("navigation", { name: "Main" }).or(p.getByRole("banner")).first()).toBeVisible();
  await expect(p.getByTestId("story-card").first()).toBeVisible();
  await expect(p.getByTestId("trending-now")).toContainText(/Tendances|tendance/i);
});

test("L-03/L-18 Arabic market: RTL UI, usable menus and map, numerals and source URLs legible", async ({ browser }) => {
  const ctx = await guest(browser, "EG", "ar-EG", { viewport: { width: 390, height: 844 } });
  const p = await ctx.newPage();
  await p.goto("/feed");
  expect(await htmlAttrs(p)).toMatchObject({ lang: "ar", dir: "rtl" });
  const font = await p.evaluate(() => getComputedStyle(document.body).fontFamily);
  expect(font).toMatch(/Arabic/i);
  await expect(p.getByTestId("story-card").first()).toBeVisible();
  const overflow = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await p.getByTestId("prefs-menu").click();
  await expect(p.locator("#pref-ui")).toBeVisible();
  await p.screenshot({ path: `${shotDir}/v13-ar-rtl-home-390.png` });
  await p.keyboard.press("Escape");
  await p.goto("/local-pulse?country=NG");
  await expect(p.getByTestId("pulse-map")).toBeVisible();
  await expect(p.getByTestId("area-list")).toBeVisible();
  await p.screenshot({ path: `${shotDir}/v13-ar-rtl-pulse-390.png`, fullPage: true });
  await ctx.close();
});

test("L-04 saved explicit English + Nigeria edition survive a trip to Senegal", async ({ browser }) => {
  const ctx = await guest(browser, "SN", "fr-SN");
  await ctx.addCookies([prefsCookie({ ui: "en", reading: "en", edition: "NG" })]);
  const p = await ctx.newPage();
  await p.goto("/feed");
  expect(await htmlAttrs(p)).toMatchObject({ lang: "en", edition: "NG", reading: "en" });
  await p.goto("/local-pulse?country=SN"); // browsing Senegal does not rewrite preferences
  await p.goto("/feed");
  expect(await htmlAttrs(p)).toMatchObject({ lang: "en", edition: "NG", reading: "en" });
});

test("L-05/L-24 browser French beats coarse English-country default; a visible override persists across refresh and login", async ({ browser }) => {
  const ctx = await guest(browser, "NG", "fr-FR");
  const p = await ctx.newPage();
  await p.goto("/feed");
  expect(await htmlAttrs(p)).toMatchObject({ lang: "fr", edition: "NG" });
  // v1.4: languages and edition are separate header controls (master §8.2); each saves independently.
  await setLanguages(p, "en", "en"); // v1.5 shadcn LanguagePicker (cookie set by server action, then refresh)
  await expect(p.locator("html")).toHaveAttribute("lang", "en");
  await chooseEdition(p, "KE");
  expect(await htmlAttrs(p)).toMatchObject({ lang: "en", edition: "KE" }); // edition change did not touch the language
  await p.reload();
  expect(await htmlAttrs(p)).toMatchObject({ lang: "en", edition: "KE", reading: "en" });
  await signIn(p, "reader@palavva.local", BASE, "/");
  expect(await htmlAttrs(p)).toMatchObject({ lang: "en", edition: "KE" });
  await ctx.close();
});

// ---------------- Translation ----------------

test("L-08/L-09/L-17 French reading: honest pending → machine label with original link; Pidgin (MT disabled) falls back openly", async ({ browser }) => {
  test.setTimeout(120_000);
  const ctx = await guest(browser, null, "en-GB");
  await ctx.addCookies([prefsCookie({ ui: "en", reading: "fr" })]);
  const p = await ctx.newPage();
  await p.goto("/feed/new");
  const href = await p.locator('a[href^="/posts/"]').first().getAttribute("href"); // Palasora Phase 1: news discussions retired
  await p.goto(href!);
  const bar = p.getByTestId("translation-bar");
  await expect(bar).toBeVisible();
  await expect.poll(async () => { await p.reload(); return bar.getAttribute("data-status"); }, { timeout: 90_000, intervals: [3000] }).toMatch(/machine|reviewed|unavailable/);
  const status = await bar.getAttribute("data-status");
  if (status === "machine") {
    await expect(bar).toContainText(/Machine translation|traduction automatique/i);
    await p.getByTestId("view-original").click();
    await expect(p.getByTestId("translation-bar")).toHaveAttribute("data-status", "showing-original");
  }
  await expect(p.getByRole("heading", { name: /Read the sources|Lire les sources/ })).toBeVisible(); // publisher link preserved
  await p.screenshot({ path: `${shotDir}/v13-translation-${status}-1440.png` });

  await ctx.addCookies([prefsCookie({ ui: "en", reading: "pcm" })]);
  await p.goto(href!);
  await expect(p.getByTestId("translation-bar")).toHaveAttribute("data-status", "unavailable");
  await expect(p.getByTestId("translation-bar")).toContainText("isn't available");
  await ctx.close();
});

test("L-08 editor can see, correct and block translations", async ({ page }) => {
  await signIn(page, "editor@palavva.local", BASE, "/admin/translations");
  await expect(page.getByRole("heading", { level: 1, name: "Translations" })).toBeVisible();
  await expect(page.getByTestId("language-registry")).toContainText("Naijá");
  // v1.8+ ISSUE-10: compact table; a row opens the original and the translation side by side with Block / Approve / Correct.
  await page.getByTestId("translations-filter-status-machine_unreviewed").click();
  const row = page.getByTestId("translations").locator("tbody tr[data-row]").first();
  if (await row.count()) {
    const id = await row.getAttribute("data-row");
    await row.click();
    await expect(page.getByTestId("translation-detail").getByTestId("pair").first()).toBeVisible();
    page.once("dialog", (d) => d.accept());
    await page.getByTestId("translation-detail").getByRole("button", { name: /^Block/ }).click();
    await expect(page.getByTestId("translation-detail")).toContainText("blocked (readers see the original)");
    await page.reload();
    await page.getByTestId("translations-filter-status-blocked").click();
    await expect(page.locator(`[data-row="${id}"]`)).toBeVisible();
  }
  await page.screenshot({ path: `${shotDir}/v13-admin-translations-1440.png`, fullPage: true });
});

// ---------------- Maps / Local Pulse ----------------

test("L-10/L-19 Nigeria map: 36 states + FCT, every area keyboard-reachable, text list equivalent", async ({ page }) => {
  await page.goto("/local-pulse?country=NG");
  const areas = page.locator('[data-testid="pulse-map"] a[data-area]');
  await expect(areas).toHaveCount(37);
  const codes = await areas.evaluateAll((els) => els.map((e) => e.getAttribute("data-area")));
  for (const c of ["NG-LA", "NG-KN", "NG-FC", "NG-RI", "NG-IM", "NG-BO", "NG-OY", "NG-EN"]) expect(codes).toContain(c);
  const labels = await areas.evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")));
  expect(labels.every((l) => l && l.length > 3)).toBeTruthy();
  await expect(page.getByTestId("area-list").getByRole("link")).toHaveCount(37);
  await areas.first().focus();
  await expect(areas.first()).toBeFocused();
  await page.screenshot({ path: `${shotDir}/v13-pulse-ng-1440.png`, fullPage: true });
  for (const [cc, n] of [["ZA", 9], ["KE", 47], ["GH", 16], ["SN", 14]] as const) {
    await page.goto(`/local-pulse?country=${cc}`);
    await expect(page.locator('[data-testid="pulse-map"] a[data-area]')).toHaveCount(n);
  }
});

test("L-11/L-14 state drill filters real stories or says Limited reporting; no glow without real recent activity", async ({ page }) => {
  await page.goto("/local-pulse?country=NG");
  await page.locator('[data-testid="pulse-map"] a[data-area="NG-KN"]').click();
  await expect(page).toHaveURL(/area=NG-KN/);
  const cards = page.getByTestId("story-card");
  if (await cards.count()) await expect(page.getByTestId("area-activity")).toBeVisible();
  else await expect(page.getByTestId("limited-coverage")).toContainText("Limited reporting available");
  // Areas with zero stories never animate.
  const zeroPulsing = await page.locator('[data-testid="pulse-map"] a[data-stories="0"] .animate-pulse, [data-testid="pulse-map"] a[data-stories="0"] [class*="animate-pulse"]').count();
  expect(zeroPulsing).toBe(0);
});

test("L-15/L-16 home shows two separately labelled trend panels with freshness and origin; cross-border click keeps language", async ({ browser }) => {
  const ctx = await guest(browser, "NG", "en-NG");
  const p = await ctx.newPage();
  await p.goto("/feed");
  await expect(p.getByTestId("trending-now")).toBeVisible();
  await expect(p.getByTestId("trending-africa")).toBeVisible();
  await expect(p.getByTestId("trending-now").getByRole("heading")).not.toHaveText(await p.getByTestId("trending-africa").getByRole("heading").innerText());
  for (const panel of ["trending-now", "trending-africa"]) {
    const times = p.getByTestId(panel).locator("time");
    if (await times.count()) await expect(times.first()).toHaveAttribute("datetime", /\d{4}-\d{2}-\d{2}T/);
  }
  const link = p.getByTestId("africa-trend-link").first();
  if (await link.count()) {
    await link.click();
    await p.waitForLoadState();
    expect(await htmlAttrs(p)).toMatchObject({ lang: "en", edition: "NG", reading: "en" }); // L-06 invariant
  }
  await ctx.close();
});

test("L-20 no geolocation request on load; site fully usable with geolocation denied", async ({ browser }) => {
  const ctx = await browser.newContext({ permissions: [] });
  await ctx.addInitScript(() => {
    (window as unknown as { __geo: number }).__geo = 0;
    const g = navigator.geolocation;
    if (g) { g.getCurrentPosition = () => { (window as unknown as { __geo: number }).__geo++; }; g.watchPosition = () => { (window as unknown as { __geo: number }).__geo++; return 0; }; }
  });
  const p = await ctx.newPage();
  for (const path of ["/", "/local-pulse", "/explore-africa", "/my-africa"]) {
    await p.goto(path);
    await p.waitForTimeout(500);
    expect(await p.evaluate(() => (window as unknown as { __geo: number }).__geo), path).toBe(0);
  }
  await ctx.close();
});

test("L-19 reduced motion: no running animations on home or Local Pulse", async ({ browser }) => {
  const ctx = await browser.newContext({ reducedMotion: "reduce" });
  const p = await ctx.newPage();
  for (const path of ["/", "/local-pulse?country=ZA"]) {
    await p.goto(path);
    const running = await p.evaluate(() => document.getAnimations().filter((a) => a.playState === "running").length);
    expect(running, path).toBe(0);
  }
  await ctx.close();
});

test("L-22 performance: first story and map render fast on a throttled mobile profile; no layout shift from the map", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const p = await ctx.newPage();
  const cdp = await ctx.newCDPSession(p);
  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 });
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  const result: Record<string, number> = {};
  for (const path of ["/feed", "/local-pulse?country=NG"]) { // Phase 6: the feed moved from "/" to "/feed"
    await p.addInitScript(() => {
      (window as unknown as { __cls: number }).__cls = 0;
      new PerformanceObserver((l) => { for (const e of l.getEntries() as (PerformanceEntry & { value: number; hadRecentInput: boolean })[]) if (!e.hadRecentInput) (window as unknown as { __cls: number }).__cls += e.value; }).observe({ type: "layout-shift", buffered: true });
    });
    const t0 = Date.now();
    await p.goto(path, { waitUntil: "commit" });
    await (path === "/feed" ? p.getByTestId("story-card").first() : p.getByTestId("pulse-map")).waitFor();
    result[`${path} visible_ms`] = Date.now() - t0;
    const fcp = await p.evaluate(() => performance.getEntriesByName("first-contentful-paint")[0]?.startTime ?? -1);
    result[`${path} fcp_ms`] = Math.round(fcp);
    await p.waitForTimeout(1500);
    result[`${path} cls`] = await p.evaluate(() => (window as unknown as { __cls: number }).__cls);
  }
  console.log("L-22", JSON.stringify(result));
  expect(result["/feed visible_ms"]).toBeLessThan(8000);
  expect(result["/feed cls"]).toBeLessThan(0.1);
  expect(result["/local-pulse?country=NG cls"]).toBeLessThan(0.1);
  await ctx.close();
});

test("L-25 demo content is labelled as fictional and kept out of trend popularity", async ({ page }) => {
  test.skip(true, "news retired (NEWS_RETIRED=true): every demo item is an editorial news discussion or story, hidden in Palasora Phase 1");
  await page.goto("/discussion/demo-rainy-season-delivery-routes");
  await expect(page.getByText("Demo content").first()).toBeVisible();
  await page.goto("/feed");
  const demoCards = page.getByTestId("story-card").filter({ hasText: "Demo content" });
  if (await demoCards.count()) await expect(demoCards.first()).toContainText("Demo content");
});

test("S-v13 screenshots: home rail, Local Pulse, Explore Africa, My Africa at 320/390/768/1440, light and dark", async ({ browser }) => {
  test.setTimeout(180_000);
  for (const scheme of ["light", "dark"] as const) {
    for (const w of [320, 390, 768, 1440]) {
      const ctx = await browser.newContext({ viewport: { width: w, height: 900 }, colorScheme: scheme, extraHTTPHeaders: { "x-test-country": "NG" } });
      const p = await ctx.newPage();
      for (const [path, name] of [["/", "home"], ["/local-pulse?country=NG", "pulse"], ["/explore-africa", "explore"], ["/my-africa", "my-africa"]]) {
        await p.goto(path);
        const overflow = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(overflow, `${path} @${w} ${scheme}`).toBeLessThanOrEqual(0);
        await p.screenshot({ path: `${shotDir}/v13-${name}-${scheme}-${w}.png`, fullPage: w <= 390 ? false : true });
      }
      await ctx.close();
    }
  }
});

// Runs last in this file: it revokes the fixture source, which withdraws its derived topic.
test("A-05 rights revocation propagates: topic withdrawn, public correction, thread_paused event", async ({ page }) => {
  test.skip(true, "news retired (NEWS_RETIRED=true): publisher sources and their derived topics are hidden; rights revocation is removed with the news code in stage 4");
  await page.goto("/feed/new");
  const card = page.getByTestId("story-card").filter({ hasText: "Fixture Wire (synthetic)" }).first();
  await expect(card).toBeVisible();
  const href = (await card.locator('a[href^="/discussion/"]').first().getAttribute("href"))!;
  const pieceId = await card.getAttribute("data-piece-id");
  expect((await page.request.get(href)).status()).toBe(200);
  const cursor = (await (await page.request.get("/api/v1/events/replay")).json()).meta.latest_seq as number;
  await signIn(page, "admin@palavva.local", BASE, "/admin/sources");
  page.on("dialog", (d) => d.accept());
  const row = page.getByTestId("source-row").filter({ hasText: "Fixture Wire (synthetic)" });
  await row.getByRole("button", { name: "Revoke rights" }).click();
  await expect(row).toContainText("Rights: revoked"); // the action's button (and its message) unmount once revoked
  expect([404, 410]).toContain((await page.request.get(href)).status());
  await page.goto("/corrections");
  await expect(page.getByText(/Withdrawn: the source's usage rights were revoked/).first()).toBeVisible();
  const evs = (await (await page.request.get(`/api/v1/events/replay?cursor=${cursor}`)).json()).data as { type: string; piece_id: string }[];
  expect(evs.some((e) => e.type === "thread_paused" && e.piece_id === pieceId)).toBe(true);
  await page.goto("/feed/new");
  await expect(page.getByTestId("story-card").filter({ hasText: "Fixture Wire (synthetic)" })).toHaveCount(0);
});

test("L-03 header menus stay inside the viewport in RTL and LTR at 320/390", async ({ browser }) => {
  for (const [loc, cc] of [["ar-EG", "EG"], ["en-NG", "NG"]] as const) {
    for (const w of [320, 390]) {
      const ctx = await guest(browser, cc, loc, { viewport: { width: w, height: 800 } });
      const p = await ctx.newPage();
      await p.goto("/feed");
      // The menu is a client component: retry the click until hydration has attached the handler.
      await expect(async () => {
        if (!(await p.getByTestId("prefs-panel").isVisible())) await p.getByTestId("prefs-menu").click();
        await expect(p.getByTestId("prefs-panel")).toBeVisible({ timeout: 2000 });
      }).toPass({ timeout: 20000 });
      const box = (await p.getByTestId("prefs-panel").boundingBox())!;
      expect(box.x, `${loc} @${w}`).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width, `${loc} @${w}`).toBeLessThanOrEqual(w);
      await ctx.close();
    }
  }
});
