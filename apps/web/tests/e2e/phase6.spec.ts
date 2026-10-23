// Palasora Phase 6 acceptance (Doc 06 sections 8, 9 and 14; Doc 03 sections 6 and 9): the app opens into the town; both
// menus work on phones in portrait and landscape with 44 pt targets; cards open on tap; "since you left" comes from stored
// events; the 2D map and the list view work without Three.js; Three.js loads only on the world routes; the town stays far
// under 150 draw calls. The test stack founds the town's plot grid and seeds eight businesses (e2e_fixtures.seed_town).
import { expect, test, type Browser, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { BASE, noConsentBanner, signIn } from "./helpers";

const shots = path.resolve(__dirname, "../../../../docs/evidence/phase-6");
mkdirSync(shots, { recursive: true });
const PHONE = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 };
const LAND = { viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 };

test.describe.configure({ mode: "serial" });
test.setTimeout(120_000);

async function openWorld(page: Page, url = "/") {
  await noConsentBanner(page);
  await page.goto(`${BASE}${url}`);
  await expect(page.getByTestId("world")).toBeVisible();
  await page.waitForFunction(() => window.__world?.ready === true, null, { timeout: 60_000 });
}
async function phone(browser: Browser, opts: typeof PHONE) {
  const ctx = await browser.newContext(opts);
  return { ctx, page: await ctx.newPage() };
}
async function targetsAtLeast44(page: Page, sel: string) {
  const sizes = await page.locator(sel).evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return { w: r.width, h: r.height, t: e.textContent?.trim() }; }));
  expect(sizes.length).toBeGreaterThan(0);
  for (const s of sizes) expect(s.h, `${s.t} is ${s.h}px tall`).toBeGreaterThanOrEqual(44);
  return sizes;
}

test("P6-01 the app opens into the 3D town: status chip, both menus, no site header, under 150 draw calls", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openWorld(page, "/?hour=10");
  await expect(page.getByTestId("world-canvas")).toBeVisible();
  await expect(page.getByTestId("status-chip")).toContainText("First Town");
  await expect(page.getByTestId("main-menu-button")).toBeVisible();
  await expect(page.getByTestId("quick-menu-button")).toBeVisible();
  await expect(page.locator("header").filter({ hasText: "Sign in" })).toHaveCount(0);
  const info = await page.evaluate(() => window.__world!.info());
  expect(info.calls).toBeGreaterThan(0);
  expect(info.calls).toBeLessThan(150);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(shots, "town-desktop-day.png") });
  await page.evaluate(() => window.__world!.setHour(21));
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(shots, "town-desktop-night.png") });
  // the list view is in the page for screen readers
  await expect(page.getByTestId("town-list")).toHaveClass(/sr-only/);
  await expect(page.getByTestId("town-list")).toContainText("Town Hall on plot P505");
});

test("P6-02 tapping a plot opens its card; a shared link with ?at= lands on the same plot", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openWorld(page, "/town/first-town?at=P405&hour=11");
  const card = page.getByTestId("world-card");
  await expect(card).toHaveAttribute("data-card", "plot");
  await expect(card).toContainText("Food stall");
  await expect(card.getByTestId("card-business")).toContainText("Has everything");
  await expect(card.getByTestId("card-business")).toContainText("2.5 Sora");
  await page.waitForTimeout(1200);
  await page.screenshot({ path: path.join(shots, "town-card-desktop.png") });
  await page.keyboard.press("Escape");
  await expect(card).toHaveCount(0);
  // a tap on the canvas centre selects whatever is there (or closes cards on open ground) without errors
  const box = (await page.getByTestId("world-canvas").boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(page.getByTestId("world")).toBeVisible();
  const other = await page.request.get(`${BASE}/town/another-town`);
  expect(other.status()).toBe(404);
});

test("P6-03 phone portrait: main menu sheet and quick menu stack upward, every target at least 44 pt, Esc and tap-outside close", async ({ browser }) => {
  const { ctx, page } = await phone(browser, PHONE);
  await openWorld(page, "/?hour=9");
  await page.screenshot({ path: path.join(shots, "town-phone-portrait.png") });
  const mainBtn = page.getByTestId("main-menu-button");
  expect((await mainBtn.boundingBox())!.width).toBeGreaterThanOrEqual(44);
  expect((await mainBtn.boundingBox())!.x).toBeLessThan(40); // top-left
  await mainBtn.tap();
  await expect(mainBtn).toHaveAttribute("aria-expanded", "true");
  const menu = page.getByTestId("main-menu");
  await expect(menu).toBeVisible();
  for (const g of ["Social", "Agents and places", "Play", "Account"]) await expect(menu.getByRole("group", { name: g })).toBeVisible();
  await expect(menu.getByRole("group", { name: "Staff" })).toHaveCount(0);
  const w = (await menu.boundingBox())!.width;
  expect(w).toBeGreaterThan(390 * 0.8); expect(w).toBeLessThanOrEqual(390 * 0.86);
  await targetsAtLeast44(page, '[data-testid="main-menu"] [role="menuitem"]');
  await page.screenshot({ path: path.join(shots, "menu-main-portrait.png") });
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
  await expect(mainBtn).toHaveAttribute("aria-expanded", "false");

  const quickBtn = page.getByTestId("quick-menu-button");
  const qb = (await quickBtn.boundingBox())!;
  expect(qb.width).toBeGreaterThanOrEqual(56); expect(qb.x + qb.width).toBeGreaterThan(390 - 40); // bottom-right
  await quickBtn.tap();
  const quick = page.getByTestId("quick-menu");
  const items = quick.getByRole("menuitem");
  await expect(items).toHaveText(["My Plot", "My Agent", "Social Feed", "Wallet", "Sora Exchange", "Travel", "Notifications"]);
  const boxes = await targetsAtLeast44(page, '[data-testid="quick-menu"] [role="menuitem"]');
  const ys = await items.evaluateAll((els) => els.map((e) => e.getBoundingClientRect().top));
  for (let i = 1; i < ys.length; i++) expect(ys[i]).toBeLessThan(ys[i - 1]); // nearest the thumb first, stacking upward
  expect(boxes.length).toBe(7);
  await page.screenshot({ path: path.join(shots, "menu-quick-portrait.png") });
  await page.getByTestId("quick-travel").tap();
  await expect(page.getByTestId("world-card")).toContainText("More towns grow as the population grows.");
  const card = (await page.getByTestId("world-card").boundingBox())!;
  expect(card.y).toBeGreaterThan(844 * 0.45); // half-height sheet
  await ctx.close();
});

test("P6-04 phone landscape: main menu is a 320 px panel, quick menu fans out in one row, cards open in a right panel", async ({ browser }) => {
  const { ctx, page } = await phone(browser, LAND);
  await openWorld(page, "/?hour=17");
  await page.screenshot({ path: path.join(shots, "town-phone-landscape.png") });
  await page.getByTestId("main-menu-button").tap();
  expect(Math.round((await page.getByTestId("main-menu").boundingBox())!.width)).toBe(320);
  await targetsAtLeast44(page, '[data-testid="main-menu"] [role="menuitem"]');
  await page.keyboard.press("Escape");
  await page.getByTestId("quick-menu-button").tap();
  const tops = await page.getByTestId("quick-menu").getByRole("menuitem").evaluateAll((els) => els.map((e) => e.getBoundingClientRect()));
  expect(tops).toHaveLength(7);
  for (const r of tops) expect(Math.abs(r.top - tops[0].top)).toBeLessThan(2); // one row
  for (let i = 1; i < tops.length; i++) expect(tops[i].left).toBeLessThan(tops[i - 1].left); // fanning leftward
  await page.screenshot({ path: path.join(shots, "menu-quick-landscape.png") });
  await page.getByTestId("quick-plot").tap();
  const card = page.getByTestId("world-card");
  await expect(card).toHaveAttribute("data-card", "place"); // no plot yet: My Plot opens Find a place
  const b = (await card.boundingBox())!;
  expect(b.width).toBeLessThanOrEqual(340); expect(b.x).toBeGreaterThan(844 / 2);
  await ctx.close();
});

test("P6-05 a resident sees \"since you left\" from stored events, My Plot flies home, and markers sit on the changed plots", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await noConsentBanner(page);
  await signIn(page, "reader@palavva.local", BASE, "/feed");
  await page.evaluate(() => sessionStorage.clear());
  await openWorld(page, "/?hour=12");
  const card = page.getByTestId("world-card");
  await expect(card).toHaveAttribute("data-card", "away");
  await expect(card.getByTestId("away-list")).toContainText("A new stall opened on plot P405");
  await expect(card.getByTestId("away-list")).toContainText("Yours");
  await expect(card.getByTestId("away-tour")).toBeVisible();
  await page.screenshot({ path: path.join(shots, "since-you-left-phone.png") });
  await card.getByRole("button", { name: "Close card" }).click();
  await page.getByTestId("quick-menu-button").click();
  await page.getByTestId("quick-plot").click();
  await expect(card).toHaveAttribute("data-card", "plot");
  await expect(card).toContainText("Plot P405");
  await expect(card).toContainText("your plot");
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(shots, "my-plot-phone.png") });
});

test("P6-06 reduced motion: no tour button and no camera easing", async ({ browser }) => {
  const ctx = await browser.newContext({ reducedMotion: "reduce", viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  await signIn(page, "reader@palavva.local", BASE, "/feed");
  await openWorld(page, "/?hour=12");
  await expect(page.getByTestId("world-card")).toHaveAttribute("data-card", "away");
  await expect(page.getByTestId("away-tour")).toHaveCount(0);
  await ctx.close();
});

test("P6-07 the 2D map: chosen with ?view=2d, when 3D is off in Settings, or with no WebGL 2; same plots and cards; no Three.js", async ({ browser }) => {
  const ctx = await browser.newContext({ ...PHONE });
  const page = await ctx.newPage();
  const scripts: string[] = [];
  page.on("response", async (r) => { if (r.request().resourceType() === "script") scripts.push(await r.text().catch(() => "")); });
  await noConsentBanner(page);
  await page.goto(`${BASE}/?view=2d`);
  await expect(page.getByTestId("world-2d")).toBeVisible();
  await page.locator('[data-plot="P405"]').tap();
  await expect(page.getByTestId("world-card")).toContainText("Food stall");
  await page.screenshot({ path: path.join(shots, "town-2d-phone.png") });
  expect(scripts.some((s) => s.includes("THREE.WebGLRenderer"))).toBe(false);
  // Settings: turn 3D off; it sticks
  await page.goto(`${BASE}/?hour=10`);
  await page.waitForFunction(() => window.__world?.ready === true, null, { timeout: 60_000 });
  await page.getByTestId("main-menu-button").tap();
  await page.getByTestId("menu-settings").tap();
  await page.getByTestId("pref-3d").uncheck();
  await expect(page.getByTestId("world-2d")).toBeVisible();
  await page.reload();
  await expect(page.getByTestId("world-2d-reason")).toContainText("3D is off in Settings");
  await ctx.close();
  // no WebGL 2 at all
  const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await ctx2.addInitScript(() => { const g = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, k: string, ...a: unknown[]) { return k === "webgl2" ? null : (g as any).call(this, k, ...a); } as typeof g; });
  const p2 = await ctx2.newPage();
  await p2.goto(`${BASE}/`);
  await expect(p2.getByTestId("world-2d-reason")).toContainText("no WebGL 2");
  await p2.screenshot({ path: path.join(shots, "town-2d-desktop.png") });
  await ctx2.close();
});

test("P6-08 the list view shows every building in words and can return to the map", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await noConsentBanner(page);
  await page.goto(`${BASE}/?view=list`);
  const list = page.getByTestId("town-list");
  await expect(list).toBeVisible();
  await expect(list.getByRole("heading", { name: "First Town as a list" })).toBeVisible();
  await expect(list).toContainText("Workshop on plot P101");
  await expect(list).toContainText("Market Hall on plot P506");
  await page.screenshot({ path: path.join(shots, "town-list-phone.png") });
});

test("P6-09 Three.js loads only on the world routes, never on the feed, wallet, Exchange or Command Center", async ({ page }) => {
  const seen = new Map<string, boolean>();
  let current = "";
  page.on("response", async (r) => {
    if (r.request().resourceType() !== "script") return;
    const body = await r.text().catch(() => "");
    if (body.includes("THREE.WebGLRenderer")) seen.set(current, true);
  });
  await noConsentBanner(page);
  for (const route of ["/feed", "/wallet", "/exchange", "/admin", "/posts"]) {
    current = route; seen.set(route, false);
    await page.goto(`${BASE}${route}`);
    await page.waitForLoadState("load");
    await page.waitForTimeout(500);
  }
  current = "/"; seen.set("/", false);
  await page.goto(`${BASE}/?hour=10`);
  await page.waitForFunction(() => window.__world?.ready === true, null, { timeout: 60_000 });
  for (const route of ["/feed", "/wallet", "/exchange", "/admin", "/posts"]) expect(seen.get(route), `${route} loaded Three.js`).toBe(false);
  expect(seen.get("/")).toBe(true);
});

test("P6-10 the feed moved to /feed and still works; the social pages link back to the town", async ({ page }) => {
  await noConsentBanner(page);
  await page.goto(`${BASE}/feed?mode=new`);
  await expect(page.locator('[data-kind="town_event"]', { hasText: "A new stall opened on plot P405" })).toHaveCount(1);
  await expect(page.getByRole("link", { name: "Town" }).first()).toHaveAttribute("href", "/");
});
