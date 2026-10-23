// Palasora step 3: finding a place. A free plot's card shows its price and what its zone takes; "Find a place" lights up
// free homes for a newcomer and plots for sale for a resident; moving in, starting a food cart and buying a plot are
// requests the town's next hour runs through the Actions gate. The test stack gives the reader's agent p001 a home on P003
// and 300 Sora (e2e_fixtures); P305 is a free prime market plot (120 Sora), P800 a free farm belt plot (30 Sora).
import { expect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { BASE, noConsentBanner, signIn } from "./helpers";

const shots = path.resolve(__dirname, "../../../../docs/evidence/world-place");
mkdirSync(shots, { recursive: true });
const PHONE = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 };

test.describe.configure({ mode: "serial" });
test.setTimeout(180_000);

async function openWorld(page: Page, url = "/?hour=11") {
  await noConsentBanner(page);
  await page.goto(`${BASE}${url}`);
  await page.waitForFunction(() => window.__world?.ready === true, null, { timeout: 60_000 });
}
async function findAPlace(page: Page) {
  await page.getByTestId("main-menu-button").click();
  await page.getByTestId("menu-place").click();
  const card = page.getByTestId("world-card");
  await expect(card).toHaveAttribute("data-card", "place");
  await expect(card.getByTestId("place-loading")).toHaveCount(0, { timeout: 20_000 });
  return card;
}

test("S3-01 a free plot's card shows its price and zone; a visitor is asked to sign in", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openWorld(page, "/?at=P305&hour=11");
  const card = page.getByTestId("world-card");
  await expect(card.getByTestId("card-for-sale")).toContainText("For sale · 120 Sora");
  await expect(card.getByTestId("card-for-sale")).toContainText("food stalls and delivery depots");
  await page.keyboard.press("Escape");
  const place = await findAPlace(page);
  await expect(place).toContainText("Sign in to move into town");
});

test("S3-02 a newcomer picks a free home on the map and moves in at the next hour", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await signIn(page, "editor@palavva.local", BASE, "/feed");
  await openWorld(page);
  const card = await findAPlace(page);
  await expect(card.getByTestId("place")).toHaveAttribute("data-resident", "no");
  await expect(card).toContainText("Move in");
  const homes = card.getByTestId("place-home");
  expect(await homes.count()).toBeGreaterThan(3);
  // Meadowvale growth: the new houses in Southgate come first, then the old town's free homes (P003 is the reader's)
  await expect(homes.first()).toHaveText("1 Palm Lane · new");
  await expect(card.locator('[data-testid="place-home"][data-new="no"]').first()).toHaveText("Plot P004");
  await homes.first().click();
  await page.waitForTimeout(1200); // the camera flies to it; free homes are labelled close up
  await expect(page.getByTestId("pick-label").filter({ hasText: "Free home" }).first()).toBeVisible();
  await expect(card.getByTestId("place-confirm")).toContainText("Move into a new house at 1 Palm Lane? It's free, and it goes up the day you move in.");
  await page.screenshot({ path: path.join(shots, "move-in-desktop.png") });
  await card.getByTestId("place-confirm-go").click();
  await expect(card.getByTestId("place-msg")).toContainText("You move in at the town's next hour");
  await expect(card.getByTestId("place-requests").locator("li").first()).toContainText("Move in · S001: waiting for the next hour");
  // one move at a time: the homes can't be picked again while this one waits (others are no longer offered S001 at all)
  await expect(card.getByTestId("place-home").first()).toBeDisabled();
});

test("S3-03 phone: a resident starts a food cart and buys a plot, priced by zone", async ({ browser }) => {
  const ctx = await browser.newContext(PHONE);
  const page = await ctx.newPage();
  await signIn(page, "reader@palavva.local", BASE, "/feed");
  await openWorld(page, "/?at=P305&hour=11");
  await page.getByTestId("world-card").getByTestId("card-buy-plot").click(); // "Buy this plot" opens Find a place on it
  const card = page.getByTestId("world-card");
  await expect(card).toHaveAttribute("data-card", "place");
  await expect(card.getByTestId("place")).toHaveAttribute("data-resident", "yes");
  await expect(card.getByTestId("place-me")).toContainText("Plot P003");
  await expect(card.getByTestId("place-balance")).toHaveText("300 Sora");
  await card.getByTestId("place-start-cart").click();
  await expect(card.getByTestId("place-confirm")).toContainText("Start a food cart for 40 Sora by plot P305?");
  await card.getByTestId("place-confirm-go").click();
  await expect(card.getByTestId("place-msg")).toContainText("next hour");
  await expect(card.getByTestId("place-zone-market")).toHaveAttribute("aria-selected", "true");
  const p305 = card.getByTestId("place-plot").first();
  await expect(p305).toHaveAttribute("data-plot", "P305");
  await expect(p305).toContainText("120 Sora");
  await expect(p305).toContainText("prime");
  await expect(p305.getByTestId("place-build-farm")).toHaveCount(0); // a market plot takes no farm
  await p305.getByTestId("place-build-stall").click();
  await expect(card.getByTestId("place-confirm")).toContainText("Buy plot P305 and build a food stall for 270 Sora?");
  await card.getByTestId("place-confirm-go").click();
  const reqs = card.getByTestId("place-requests").locator("li");
  await expect(reqs.first()).toContainText("Buy a plot · P305 · Food stall: waiting for the next hour");
  await expect(reqs.nth(1)).toContainText("Start a food cart · P305: waiting for the next hour");
  for (const b of await card.locator("button").all()) if (await b.isVisible()) expect((await b.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await page.screenshot({ path: path.join(shots, "find-a-place-phone.png") });
  // a farm belt plot is cheaper and takes only farms
  await card.getByTestId("place-zone-farmland").click();
  const farm = card.locator('[data-testid="place-plot"][data-plot="P800"]');
  await expect(farm).toContainText("30 Sora");
  await expect(farm.getByTestId("place-build-farm")).toContainText("Farm · 380 Sora");
  await expect(farm.getByTestId("place-build-farm")).toBeDisabled(); // 300 Sora is not enough yet
  await ctx.close();
});
