// Palasora Phase 4 acceptance (Doc 06 sections 5, 13, 14 and 19): town events reach the feed exactly once with a link to
// their record, owner-only events stay private, the reader is notified and sees "while you were away", and staff see the
// relay's held list. The test stack seeds six stored events (e2e_fixtures.seed_town) and relays them like the worker does.
import { expect, test } from "@playwright/test";
import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { BASE, noConsentBanner, signIn } from "./helpers";

const envText = readFileSync(path.resolve(__dirname, "../../../../.env.test"), "utf8");
const TOKEN = /^EDITORIAL_SERVICE_TOKEN=(.*)$/m.exec(envText)![1].trim();
const ECON = "http://127.0.0.1:8400/economy";
const shots = path.resolve(__dirname, "../../../../docs/evidence/phase-4");
mkdirSync(shots, { recursive: true });
const econ = async (p: string) => (await fetch(`${ECON}${p}`, { headers: { "x-service-token": TOKEN } })).json();

test.describe.configure({ mode: "serial" });

test("P4-01 a public town event appears in the main feed exactly once, labelled and linked to its record", async ({ page }) => {
  await noConsentBanner(page);
  await page.goto(`${BASE}/?mode=new`);
  const card = page.locator('[data-kind="town_event"]', { hasText: "A new stall opened on plot P0405" });
  await expect(card).toHaveCount(1);
  await expect(card.getByTestId("town-label")).toHaveText("Town record");
  await expect(card.getByTestId("town-record-link")).toBeVisible();
  // An arrival is public but not "public enough": it stays in the town's SubPal.
  await expect(page.locator('[data-kind="town_event"]', { hasText: "p002 arrived in town" })).toHaveCount(0);
  await page.screenshot({ path: path.join(shots, "feed-town-event.png"), fullPage: false });
});

test("P4-02 the town SubPal lists every public town event once, and none of the private ones", async ({ page }) => {
  await noConsentBanner(page);
  await page.goto(`${BASE}/p/first-town`);
  for (const text of ["A new stall opened on plot P0405", "A new farm opened on plot P0809", "p002 arrived in town"])
    await expect(page.locator('[data-kind="town_event"]', { hasText: text })).toHaveCount(1);
  await expect(page.getByText("started work at b001")).toHaveCount(0);
  await expect(page.getByText("changed its price")).toHaveCount(0);
});

test("P4-03 the post links to the live record; numbers come from the economy service", async ({ page }) => {
  await noConsentBanner(page);
  await page.goto(`${BASE}/p/first-town`);
  await page.locator('[data-kind="town_event"]', { hasText: "A new stall opened on plot P0405" }).getByRole("link", { name: "see the live record" }).click();
  await expect(page.getByTestId("town-record")).toBeVisible();
  await expect(page.getByTestId("town-record-price")).toHaveText("2.50 Sora");
  await page.screenshot({ path: path.join(shots, "town-record.png"), fullPage: true });
});

test("P4-04 owner-only and town-only events are not public pages", async ({ page }) => {
  const held = await econ("/admin/town/outbox");
  expect(Object.values(held.counts).every((c) => !(c as Record<string, number>).held)).toBe(true);
  for (const id of ["ev-00000003", "ev-00000004"]) {
    const r = await page.goto(`${BASE}/town/event/${id}`);
    expect(r?.status()).toBe(404);
  }
});

test("P4-05 the owner is notified of their business's real events and sees while you were away", async ({ page }) => {
  await noConsentBanner(page);
  await signIn(page, "reader@palavva.local", BASE, "/notifications");
  await page.goto(`${BASE}/notifications`);
  await expect(page.getByText("A new worker started")).toHaveCount(1);
  await expect(page.getByText("Business opened")).toHaveCount(1);
  const away = page.getByTestId("while-away");
  await expect(away).toBeVisible();
  await expect(away.getByTestId("while-away-item").first()).toContainText("Yours");
  await expect(away).toContainText("Local Reader's agent"); // residents by their public names, never raw town ids
  await expect(away).not.toContainText("p001");
  await page.screenshot({ path: path.join(shots, "notifications-away.png"), fullPage: true });
  // The owner may open their own owner-only event.
  await page.goto(`${BASE}/town/event/ev-00000003`);
  await expect(page.getByTestId("town-record-private")).toBeVisible();
});

test("P4-06 the Command Center shows the relay's deliveries and an empty held list", async ({ page }) => {
  await noConsentBanner(page);
  await signIn(page, "admin@palavva.local", BASE, "/admin/town");
  await page.goto(`${BASE}/admin/town`);
  await expect(page.getByTestId("town-outbox")).toBeVisible();
  await expect(page.getByTestId("town-held-empty")).toBeVisible();
  await expect(page.getByTestId("held-feed")).toHaveText("0");
  await page.screenshot({ path: path.join(shots, "admin-town.png"), fullPage: true });
});
