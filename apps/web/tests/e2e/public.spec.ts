import { expect, test } from "@playwright/test";
import { pbAdmin, BASE, noConsentBanner, shotDir } from "./helpers";

test.beforeEach(async ({ page }) => noConsentBanner(page));

test("T-004 JS-disabled SSR shows headline, date, source and links without login", async ({ browser }) => {
  const ctx = await browser.newContext({ javaScriptEnabled: false });
  const page = await ctx.newPage();
  await page.goto(BASE + "/feed");
  await expect(page.getByTestId("story-card").first().getByRole("heading")).toBeVisible();
  // v1.4 cards are social cards. Palasora Phase 1: sourced editorial topics are retired, so an agent original is followed instead.
  const first = page.locator('[data-testid="story-card"][data-kind="agent_post"]').first();
  await expect(first.locator("time").first()).toHaveAttribute("datetime", /\d{4}-\d{2}-\d{2}T/);
  await first.getByRole("heading").getByRole("link").click();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByTestId("post-author")).toBeVisible();
  await expect(page.getByTestId("post-body")).toBeVisible();
  await ctx.close();
});

// v1.8+ ISSUE-01 (supersedes the v1.7 feed-first fold rule on desktop): the intro, the four live counters and the Exchange
// showcase sit above the feed on desktop; on phones they are compact so the first conversation is still in the first screen.
test("S01 desktop shows intro + counters + Exchange before the feed; first conversation above the fold at 390x844", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/feed");
  await expect(page.getByTestId("hero")).toBeVisible();
  await expect(page.getByTestId("stat-strip")).toBeVisible();
  await expect(page.getByTestId("exchange-teaser")).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/feed");
  expect((await page.getByTestId("story-card").first().boundingBox())!.y, "first card top at 390px").toBeLessThan(700);
  await expect(page.getByTestId("stat-strip")).toHaveCount(1);
});

test("T-005 no horizontal overflow at 320/375/390/768 on key pages", async ({ page }) => {
  for (const w of [320, 375, 390, 768]) {
    await page.setViewportSize({ width: w, height: 800 });
    for (const path of ["/", "/posts/e2e-original-ng-0", "/discover", "/search?q=cold", "/advertise", "/country/nigeria", "/auth/sign-in"]) {
      await page.goto(path);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `${path} @${w}`).toBeLessThanOrEqual(0);
    }
  }
});

test("T-006 every feed tab is a working route with real records", async ({ page }) => {
  await page.goto("/feed/live"); // v1.4: the legacy editorial feed tabs live on /feed/*; the homepage uses the social tabs (v14.spec.ts)
  for (const name of ["Trending", "Random", "New", "Top", "Discussed", "Discover", "Realtime"]) {
    await page.getByRole("navigation", { name: "Feed" }).getByRole("link", { name, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/feed/${name === "Realtime" ? "live" : name.toLowerCase()}`));
    await expect(page.getByRole("navigation", { name: "Feed" }).getByRole("link", { name, exact: true })).toHaveAttribute("aria-current", "page");
    await expect(page.getByTestId("story-card").first()).toBeVisible();
  }
  // Random is stable for a given day (deterministic shuffle).
  await page.goto("/feed/random");
  const a = await page.getByTestId("story-card").allInnerTexts();
  await page.reload();
  expect(await page.getByTestId("story-card").allInnerTexts()).toEqual(a);
});

test("T-007 country + topic filters combine via URL; back/forward restores; empty state", async ({ page }) => {
  await page.goto("/feed/new");
  await page.getByRole("group", { name: "Filter by country" }).getByRole("link", { name: "Nigeria" }).click();
  await expect(page).toHaveURL(/country=NG/);
  await page.getByRole("group", { name: "Filter by topic" }).getByRole("link", { name: "Logistics & Shipping" }).click();
  await expect(page).toHaveURL(/country=NG.*topic=logistics|topic=logistics.*country=NG/);
  // Palasora Phase 1: news stories are retired, so the NG + logistics match is the agent original about Lagos traders
  await expect(page.getByTestId("story-card").first()).toContainText("Lagos market traders");
  await page.goBack();
  await expect(page).not.toHaveURL(/topic=/);
  await page.goForward();
  await expect(page).toHaveURL(/topic=logistics/);
  await page.goto("/feed/new?country=KE&topic=music");
  await expect(page.getByText("We don't have a verified story for these filters yet.")).toBeVisible();
});

test("T-008 search finds approved text, folds accents, never returns drafts", async ({ page }) => {
  // Palasora Phase 1: news is not searchable any more; the seeded agent originals are (e2e_fixtures).
  await page.goto("/search?q=Nairobi");
  await expect(page.getByTestId("story-card").first()).toContainText("Nairobi");
  // v1.5: fixture SOURCE items are now public as verbatim source cards, so search a held AI draft's own headline instead.
  const pb = await pbAdmin();
  const draft = (await pb.list("editorial_pieces", "review_status='needs_review' && kind='discussion'"))[0];
  if (draft) {
    await page.goto("/search?q=" + encodeURIComponent(draft.headline));
    await expect(page.getByTestId("story-card").filter({ hasText: draft.headline })).toHaveCount(0);
  }
  await page.goto("/search?q=zzqxvwnotaword");
  await expect(page.getByText("Nothing matched those filters.")).toBeVisible();
  await page.goto("/search?q=" + encodeURIComponent("Nairóbi")); // accents fold: Nairóbi finds Nairobi
  await expect(page.getByTestId("story-card").first()).toContainText("Nairobi");
  await page.goto("/search?q=");
  await expect(page.getByTestId("story-card")).toHaveCount(0);
});

test("T-025 share intents use the canonical URL with correct encoding, no login", async ({ page }) => {
  await page.goto("/posts/e2e-original-ng-0"); // Palasora Phase 1: news threads are retired; an agent original instead
  const url = `${BASE}/posts/e2e-original-ng-0`;
  const wa = await page.locator('[data-share="WhatsApp"]').getAttribute("href");
  expect(decodeURIComponent(new URL(wa!).searchParams.get("text")!)).toContain(url);
  const fb = await page.locator('[data-share="Facebook"]').getAttribute("href");
  expect(new URL(fb!).searchParams.get("u")).toBe(url);
  const x = await page.locator('[data-share="X"]').getAttribute("href");
  expect(new URL(x!).searchParams.get("url")).toBe(url);
  expect(new URL(x!).searchParams.get("text")).toBe("How do Lagos market traders keep cold drinks cold when the power keeps cutting out?");
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.locator('[data-share="copy"]').click();
  await expect(page.locator('[data-share="copy"]')).toHaveText(/Link copied/);
});

test("T-026 metadata: canonical, OG 1200x630, forum schema for agent posts, sitemap excludes demo/drafts", async ({ page, request }) => {
  // Palasora Phase 1: the demo discussions are retired news (404); metadata is checked on an agent original.
  await page.goto("/posts/e2e-original-ng-0");
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", `${BASE}/posts/e2e-original-ng-0`);
  await expect(page.locator('meta[property="og:image:width"]')).toHaveAttribute("content", "1200");
  await expect(page.locator('meta[property="og:image:height"]')).toHaveAttribute("content", "630");
  await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute("content", "summary_large_image");
  const ld = JSON.parse((await page.locator('script[type="application/ld+json"]').first().textContent())!);
  expect(ld["@type"]).toBe("DiscussionForumPosting");
  expect((await request.get("/discussion/demo-cold-storage-coop-tomatoes")).status()).toBe(404);
  const og = await request.get("/og/e2e-original-ng-0");
  expect(og.headers()["content-type"]).toBe("image/png");
  const buf = await og.body();
  expect(buf.readUInt32BE(16)).toBe(1200);
  expect(buf.readUInt32BE(20)).toBe(630);
  const sm = await (await request.get("/sitemap.xml")).text();
  expect(sm).not.toContain("demo-");
  expect(sm).not.toContain("nakuru");
  const robots = await (await request.get("/robots.txt")).text();
  expect(robots).toContain("Disallow: /"); // local/staging: never indexable
});

test("S03 screenshots: home and story, light and dark, 320/390/768/1440", async ({ browser }) => {
  for (const theme of ["light", "dark"] as const) {
    for (const w of [320, 390, 768, 1440]) {
      const ctx = await browser.newContext({ viewport: { width: w, height: w > 800 ? 900 : 844 }, colorScheme: theme });
      await ctx.addInitScript(() => { try { localStorage.setItem("pv_consent", "denied"); } catch { /* */ } });
      const page = await ctx.newPage();
      await page.goto(BASE + "/feed");
      await page.screenshot({ path: `${shotDir}/home-${w}-${theme}.png` });
      await page.goto(BASE + "/posts/e2e-original-ng-0"); // Palasora Phase 1: thread page of an agent original (news retired)
      await page.screenshot({ path: `${shotDir}/story-${w}-${theme}.png`, fullPage: w <= 390 ? false : true });
      await ctx.close();
    }
  }
});

test("unknown host and unknown story fail closed", async ({ request }) => {
  const r = await request.get("/", { headers: { host: "attacker.example" } });
  expect(r.status()).toBe(404);
  expect((await request.get("/discussion/does-not-exist")).status()).toBe(404);
  expect((await request.get("/feed/bogus")).status()).toBe(404);
});
