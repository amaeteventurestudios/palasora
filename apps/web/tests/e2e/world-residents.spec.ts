// Palasora: the residents directory. The test stack seeds 14 residents (e2e_fixtures): house agents sharing the homes on
// Palm Street and Baobab Street, the reader's agent p001 (home P003, runs stall b001) and p002 with no home yet.
// h010 (Femi Nwosu, @femi010) works at b001 and shares the home on P004 with h011 (Yara Bello).
import { expect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { BASE, noConsentBanner, signIn } from "./helpers";

const shots = path.resolve(__dirname, "../../../../docs/evidence/world-residents");
mkdirSync(shots, { recursive: true });
const PHONE = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 };

test.describe.configure({ mode: "serial" });
test.setTimeout(180_000);

async function openWorld(page: Page, url = "/?hour=11") {
  await noConsentBanner(page);
  await page.goto(`${BASE}${url}`);
  await page.waitForFunction(() => window.__world?.ready === true, null, { timeout: 60_000 });
}
async function residents(page: Page) {
  await page.getByTestId("main-menu-button").click();
  await page.getByTestId("menu-residents").click();
  const card = page.getByTestId("world-card");
  await expect(card).toHaveAttribute("data-card", "residents");
  await expect(card.getByTestId("residents-list")).toBeVisible({ timeout: 20_000 });
  return card;
}

test("R-01 the directory counts everyone; filters and @handle search find a resident, whose card reads the ledger", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openWorld(page);
  const card = await residents(page);
  await expect(card.getByTestId("residents-count")).toContainText("14 people live in First Town");
  await expect(card.getByTestId("resident-row")).toHaveCount(14);
  await expect(card.getByTestId("residents-filter-following")).toHaveCount(0); // signed out
  await card.getByTestId("residents-filter-no_home").click();
  await expect(card.getByTestId("resident-row")).toHaveCount(1);
  await expect(card.getByTestId("resident-row")).toContainText("Tariq Sesay");
  await expect(card.getByTestId("resident-row")).toContainText("No home yet");
  await card.getByTestId("residents-filter-no_job").click();
  await expect(card.getByTestId("residents-filter-no_job")).toContainText("No job · 2");
  await expect(card.getByTestId("resident-row")).toHaveCount(2);
  await card.getByTestId("residents-filter-all").click();
  await card.getByTestId("residents-search").fill("@femi010");
  await expect(card.getByTestId("resident-row")).toHaveCount(1);
  await page.screenshot({ path: path.join(shots, "directory-desktop.png") });
  await card.getByTestId("resident-row").click();
  await expect(card).toHaveAttribute("data-card", "resident");
  const r = card.getByTestId("resident");
  await expect(r).toHaveAttribute("data-id", "h010");
  await expect(card.locator("#world-card-h")).toHaveText("Femi Nwosu");
  await expect(r.getByTestId("resident-address")).toHaveText("10 Palm Street, flat 1");
  await expect(r.getByTestId("resident-job")).toHaveText("Works at the food stall on plot P405");
  await expect(r.getByTestId("resident-income")).toHaveText("15 Sora");
  await expect(r.getByTestId("resident-worth")).toHaveText("15 Sora"); // one wage from the ledger (e2e_fixtures)
  await expect(r.getByTestId("resident-neighbour").first()).toContainText("Yara Bello");
  await expect(r.getByTestId("resident-neighbour").first()).toContainText("Same home");
  await expect(r.getByTestId("resident-follow")).toHaveCount(0);
  await page.waitForTimeout(1500); // the town flies to their home
  await page.screenshot({ path: path.join(shots, "resident-desktop.png") });
  await r.getByTestId("resident-neighbour").first().click();
  await expect(card.getByTestId("resident")).toHaveAttribute("data-id", "h011");
  await card.getByTestId("resident-back").click();
  await expect(card).toHaveAttribute("data-card", "residents");
});

test("R-02 a shared link opens the resident; the reader finds their own resident and its business", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.setViewportSize({ width: 1280, height: 800 });
  await openWorld(page, "/?resident=h010&hour=11");
  const card = page.getByTestId("world-card");
  await expect(card.getByTestId("resident")).toHaveAttribute("data-id", "h010", { timeout: 20_000 });
  await card.getByTestId("resident-copy").click();
  await expect(card.getByTestId("resident-msg")).toHaveText("Link copied.");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(`${BASE}/?resident=h010`);

  await signIn(page, "reader@palavva.local", BASE, "/feed");
  await openWorld(page);
  const list = await residents(page);
  await list.getByTestId("residents-me").click();
  const me = list.getByTestId("resident");
  await expect(me).toHaveAttribute("data-id", "p001");
  await expect(me).toContainText("· yours");
  await expect(me.getByTestId("resident-address")).toHaveText("8 Palm Street");
  await expect(me.getByTestId("resident-job")).toHaveText("Runs the food stall on plot P405");
  await expect(me.getByTestId("resident-follow")).toHaveCount(0); // not yourself
  await me.getByTestId("resident-job").click();
  await expect(list).toHaveAttribute("data-card", "plot");
  await expect(list.getByTestId("biz-card")).toBeVisible({ timeout: 20_000 });
});

test("R-03 phone: a signed-in person follows a resident and finds them under Following", async ({ browser }) => {
  const ctx = await browser.newContext(PHONE);
  const page = await ctx.newPage();
  await signIn(page, "editor@palavva.local", BASE, "/feed");
  await openWorld(page);
  const card = await residents(page);
  await expect(card.getByTestId("residents-filter-following")).toContainText("Following · 0");
  for (const t of await card.getByRole("tab").all()) expect((await t.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await page.screenshot({ path: path.join(shots, "directory-phone.png") });
  await card.getByTestId("residents-search").fill("yara");
  await card.getByTestId("resident-row").first().click();
  const r = card.getByTestId("resident");
  await expect(r).toHaveAttribute("data-id", "h011");
  await r.getByTestId("resident-follow").click();
  await expect(r.getByTestId("resident-follow")).toHaveText("Following");
  await expect(r.getByTestId("resident-followers")).toHaveText("1 follower");
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(shots, "resident-phone.png") });
  await r.getByTestId("resident-back").click();
  await card.getByTestId("residents-search").fill("");
  await card.getByTestId("residents-filter-following").click();
  await expect(card.getByTestId("resident-row")).toHaveCount(1);
  await expect(card.getByTestId("resident-row")).toContainText("Yara Bello");
  // unfollow, so the stack is left as it was
  await card.getByTestId("resident-row").click();
  await card.getByTestId("resident-follow").click();
  await expect(card.getByTestId("resident-follow")).toHaveText("Follow");
  await ctx.close();
});
