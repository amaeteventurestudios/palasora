// Meadowvale growth with Capital Rift underneath. The test stack (e2e_fixtures, _seed_suburb) has Palm Lane laid out in
// Southgate: eight new lots, all free. The reader's agent p001 lives at P003 and runs stall b001 with h010 on its team, so
// "Your path" shows the first four steps done.
import { expect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { BASE, noConsentBanner, signIn } from "./helpers";

const shots = path.resolve(__dirname, "../../../../docs/evidence/world-growth");
mkdirSync(shots, { recursive: true });
const PHONE = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 };

test.describe.configure({ mode: "serial" });
test.setTimeout(180_000);

async function openWorld(page: Page, url = "/?hour=11") {
  await noConsentBanner(page);
  await page.goto(`${BASE}${url}`);
  await page.waitForFunction(() => window.__world?.ready === true, null, { timeout: 60_000 });
}

test("G-01 a new lot in Southgate has a street address and waits for the next person", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openWorld(page, "/?at=S002&hour=11");
  const card = page.getByTestId("world-card");
  await expect(card.getByTestId("card-where")).toHaveText("2 Palm Lane, Southgate");
  await expect(card.getByTestId("card-free-home")).toContainText("a house goes up here that day");
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(shots, "new-lot-desktop.png") });
});

test("G-02 phone: Your path shows the steps done and points at the next one", async ({ browser }) => {
  const ctx = await browser.newContext(PHONE);
  const page = await ctx.newPage();
  await signIn(page, "reader@palavva.local", BASE, "/feed");
  await openWorld(page);
  await page.getByTestId("main-menu-button").click();
  await page.getByTestId("menu-path").click();
  const card = page.getByTestId("world-card");
  await expect(card).toHaveAttribute("data-card", "path");
  for (const k of ["home", "earn", "business", "staff"])
    await expect(card.locator(`[data-testid="path-step"][data-step="${k}"]`)).toHaveAttribute("data-done", "yes");
  await expect(card.locator('[data-testid="path-step"][data-step="listed"]')).toHaveAttribute("data-done", "no");
  await expect(card.getByTestId("path-summary")).toContainText("of 7 steps done.");
  await expect(card.getByTestId("path-go")).toHaveCount(1);
  await page.screenshot({ path: path.join(shots, "path-phone.png") });
  await card.getByTestId("path-go").click();
  await expect(card).not.toHaveAttribute("data-card", "path");
  await ctx.close();
});

test("G-03 signed out: Your path invites a sign-in", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openWorld(page);
  await page.getByTestId("main-menu-button").click();
  await page.getByTestId("menu-path").click();
  await expect(page.getByTestId("world-card").getByTestId("path-sign-in")).toBeVisible();
});
