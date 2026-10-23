// Palasora step 4: goods on the move, a look inside a business, and the Town Hall's plot auction. The test stack stores five
// contracts and a delivery between the founded town's businesses (vans drive them), and plot P604 at auction from 120 Sora
// (e2e_fixtures). The reader's agent p001 runs stall b001 on P405 and has 300 Sora.
import { expect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { BASE, noConsentBanner, signIn } from "./helpers";

const shots = path.resolve(__dirname, "../../../../docs/evidence/world-goods");
mkdirSync(shots, { recursive: true });
const PHONE = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 };

test.describe.configure({ mode: "serial" });
test.setTimeout(180_000);

async function openWorld(page: Page, url = "/?hour=11") {
  await noConsentBanner(page);
  await page.goto(`${BASE}${url}`);
  await page.waitForFunction(() => window.__world?.ready === true, null, { timeout: 60_000 });
}
type Goods = { routes: number; vans: number; moving: number };
const goods = (page: Page) => page.evaluate(() => window.__world!.info().goods) as Promise<Goods>;

test("S4-01 delivery vans drive the goods routes; the Goods layer names each one", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openWorld(page);
  const g = await goods(page);
  expect(g.routes).toBe(6); // five contracts (one carries the food factory's meals) and one delivery
  expect(g.vans).toBeGreaterThanOrEqual(4);
  let moving = 0;
  for (let k = 0; k < 3 && !moving; k++) moving = (await page.evaluate(() => { window.__world!.ff(5); return window.__world!.info().goods.moving; })) as number;
  expect(moving).toBeGreaterThan(0);
  await expect(page.getByTestId("goods-label")).toHaveCount(0);
  await page.getByTestId("map-goods").click();
  await expect(page.getByTestId("goods-label").filter({ hasText: "30 crops a day" })).toHaveCount(1);
  await expect(page.getByTestId("goods-label").filter({ hasText: "12 materials" })).toHaveCount(1);
  await page.screenshot({ path: path.join(shots, "goods-desktop.png") });
  // vans rest at night
  await page.evaluate(() => window.__world!.setHour(2));
  await page.evaluate(() => window.__world!.ff(1));
  expect((await goods(page)).moving).toBe(0);
});

test("S4-02 a business opens up: Look inside shows its room, staff and stock", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openWorld(page, "/?at=P405&hour=11");
  const card = page.getByTestId("world-card");
  await expect(card.getByTestId("biz-card")).toBeVisible({ timeout: 20_000 });
  await card.getByTestId("biz-look-inside").click();
  const room = card.getByTestId("biz-interior");
  await expect(room).toBeVisible();
  await expect(room).toHaveAttribute("data-people", /^[1-9]/);
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(shots, "inside-desktop.png") });
  await room.screenshot({ path: path.join(shots, "inside-room.png") });
  await card.getByTestId("biz-look-inside").click();
  await expect(room).toHaveCount(0);
});

test("S4-03 a plot at auction: its card shows the reserve and a resident bids from the place panel", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openWorld(page, "/?at=P604&hour=11");
  const card = page.getByTestId("world-card");
  await expect(card.getByTestId("card-auction")).toContainText("At auction · from 120 Sora");
  await expect(card.getByTestId("card-for-sale")).toHaveCount(0);
  await expect(card.getByTestId("card-bid")).toHaveText("Move in to bid");

  await signIn(page, "reader@palavva.local", BASE, "/feed");
  await openWorld(page, "/?at=P604&hour=11");
  await card.getByTestId("card-bid").click();
  await expect(card).toHaveAttribute("data-card", "place");
  await expect(card.getByTestId("place-loading")).toHaveCount(0, { timeout: 20_000 });
  const row = card.locator('[data-testid="place-auction"][data-plot="P604"]');
  await expect(row).toContainText("from 120 Sora");
  await expect(row.getByTestId("place-bid-amount")).toHaveValue("120");
  // P604 is not offered for sale while it is at auction
  await expect(card.locator('[data-testid="place-plot"][data-plot="P604"]')).toHaveCount(0);
  await row.getByTestId("place-bid-amount").fill("90");
  await expect(row.getByTestId("place-bid")).toBeDisabled();
  await row.getByTestId("place-bid-amount").fill("130");
  await row.getByTestId("place-bid").click();
  await expect(card.getByTestId("place-confirm")).toContainText("Bid 130 Sora for plot P604?");
  await card.getByTestId("place-confirm-go").click();
  await expect(card.getByTestId("place-msg")).toContainText("the Sora is held until you're outbid or win");
  await expect(card.getByTestId("place-requests").locator("li").first()).toContainText("Bid · P604: waiting for the next hour");
  await page.screenshot({ path: path.join(shots, "auction-desktop.png") });
});

test("S4-04 phone: goods layer, the auction board and the inside view fit the screen", async ({ browser }) => {
  const ctx = await browser.newContext(PHONE);
  const page = await ctx.newPage();
  await openWorld(page, "/?at=P405&hour=11");
  const card = page.getByTestId("world-card");
  await expect(card.getByTestId("biz-card")).toBeVisible({ timeout: 20_000 });
  await card.getByTestId("biz-look-inside").click();
  const box = await card.getByTestId("biz-interior").boundingBox();
  expect(box!.width).toBeLessThanOrEqual(390);
  expect(box!.height).toBeGreaterThan(150);
  await page.screenshot({ path: path.join(shots, "inside-phone.png") });
  await page.keyboard.press("Escape");
  await openWorld(page, "/?at=P604&hour=11");
  await expect(card.getByTestId("card-auction")).toBeVisible();
  await page.screenshot({ path: path.join(shots, "auction-phone.png") });
  await ctx.close();
});
