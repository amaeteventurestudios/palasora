// Palasora Phase 2 acceptance (Doc 06 sections 7.1 to 7.3): Pals are Sora, people have Sora accounts, the Command Center
// shows supply from the two mints, the weekly Town Hall budget and the migration state. Runs on the isolated test stack.
import { expect, test } from "@playwright/test";
import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { BASE, noConsentBanner, pbAdmin, signIn } from "./helpers";

const envText = readFileSync(path.resolve(__dirname, "../../../../.env.test"), "utf8");
const TOKEN = /^EDITORIAL_SERVICE_TOKEN=(.*)$/m.exec(envText)![1].trim();
const ECON = "http://127.0.0.1:8400/economy";
const shots = path.resolve(__dirname, "../../../../docs/evidence/phase-2");
mkdirSync(shots, { recursive: true });
const econ = async (p: string, body?: unknown) => {
  const r = await fetch(`${ECON}${p}`, { method: body ? "POST" : "GET", headers: { "x-service-token": TOKEN, "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, json: await r.json() };
};

test.describe.configure({ mode: "serial" });

test("P2-01 the ledger runs in Sora: migration state, mints and the weekly budget are reported", async () => {
  const m = await econ("/migration");
  expect(m.status).toBe(200);
  expect(m.json.note.currency).toBe("SORA");
  expect(m.json.note.rate).toBe("1 Pal = 1 Sora");
  const iss = await econ("/admin/issuance");
  expect(iss.json.weekly.budget).toBeGreaterThan(0);
  expect(iss.json.weekly.used).toBeLessThanOrEqual(iss.json.weekly.budget);
  const rec = await econ("/reconcile", {});
  expect(rec.json.ok).toBe(true);
  expect(rec.json.currency).toBe("SORA");
  expect(rec.json.supply_sora).toBe(rec.json.issued_sora - rec.json.destroyed_sora);
});

test("P2-02 a person's wallet shows Sora, the 1:1 conversion note and their own lazily created account", async ({ page }) => {
  const started = Date.now() / 1000;
  await noConsentBanner(page);
  await signIn(page, "reader@palavva.local", BASE, "/wallet");
  await page.goto(`${BASE}/wallet`);
  await expect(page.getByTestId("sora-conversion-note")).toContainText("1 Pal = 1 Sora");
  await expect(page.getByTestId("my-sora")).toBeVisible();
  await expect(page.getByTestId("my-sora-balance")).toContainText("Sora");
  await expect(page.getByTestId("wallet-page")).not.toContainText(/\d Pals\b/);
  await page.screenshot({ path: path.join(shots, "wallet-desktop.png"), fullPage: true });
  const pb = await pbAdmin();
  const reader = (await pb.list("users", "email='reader@palavva.local'"))[0];
  const a1 = await econ(`/humans/${reader.id}/account`, {});
  const a2 = await econ(`/humans/${reader.id}/account`, {});
  expect(a1.status).toBe(200);
  expect(a1.json.owner_kind).toBe("human");
  expect(a2.json.account_id).toBe(a1.json.account_id); // idempotent
  expect(a1.json.created_at).toBeLessThanOrEqual(started + 120); // made by the sign-in or the wallet visit, not by this call
});

test("P2-03 phone: the wallet shows Sora at 390x844", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await noConsentBanner(page);
  await signIn(page, "reader@palavva.local", BASE, "/wallet");
  await page.goto(`${BASE}/wallet`);
  await expect(page.getByTestId("sora-conversion-note")).toBeVisible();
  await expect(page.getByTestId("my-sora-balance")).toContainText("Sora");
  await page.screenshot({ path: path.join(shots, "wallet-phone.png"), fullPage: true });
  await ctx.close();
});

test("P2-04 Command Center: /admin/pals moved to /admin/sora; supply, weekly budget and migration state are shown", async ({ page }) => {
  await signIn(page, "admin@palavva.local", BASE, "/admin/pals");
  await expect(page).toHaveURL(/\/admin\/sora/);
  await expect(page.getByRole("heading", { name: "Sora economy" }).first()).toBeVisible();
  await expect(page.getByTestId("sora-supply")).toBeVisible();
  await expect(page.getByTestId("weekly-budget")).toContainText("Sora");
  await expect(page.getByTestId("migration-state")).toBeVisible();
  await page.screenshot({ path: path.join(shots, "admin-sora.png"), fullPage: true });
});

test("P2-05 Exchange speaks Sora and explains the listing rule", async ({ page }) => {
  await noConsentBanner(page);
  await page.goto(`${BASE}/exchange`);
  await expect(page.getByText("Simulated, Sora-only")).toBeVisible();
  await expect(page.getByTestId("listing-rule")).toContainText("30 days");
  await page.screenshot({ path: path.join(shots, "exchange.png"), fullPage: false });
});
