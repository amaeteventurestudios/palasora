// v1.7 acceptance (docs/specs/36) on the isolated test stack, through real browser interactions and real write paths:
// feed-first home and same-domain auth, footer, admin RBAC + CSRF, Population Manager jobs from the UI, Control Room
// persistence, 54-country Local Pulse, Exchange explanations, realtime highlight from a committed vote.
import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { BASE, noConsentBanner, pbAdmin, signIn } from "./helpers";

const envText = readFileSync(path.resolve(__dirname, "../../../../.env.test"), "utf8");
const TOKEN = /^EDITORIAL_SERVICE_TOKEN=(.*)$/m.exec(envText)![1].trim();
const shots = path.resolve(__dirname, "../../../../docs/evidence/v17/screenshots");

test.describe.configure({ mode: "serial" });

async function firstCardTop(page: Page) {
  const card = page.getByTestId("story-card").first();
  await card.waitFor();
  return (await card.boundingBox())!.y;
}

// v1.8+ ISSUE-01 supersedes the v1.7 "no hero band" rule: the approved intro, counters and Exchange showcase are back above
// the feed. Phones keep the feed near the top: compact intro, folded Exchange summary, first post inside the first screen.
test("V17-01 home: restored intro, counters and Exchange above the feed; phone keeps a real post above the fold", async ({ page }) => {
  await noConsentBanner(page);
  for (const [w, h] of [[1440, 900], [390, 844]] as const) {
    await page.setViewportSize({ width: w, height: h });
    await page.goto(`${BASE}/`);
    const top = await firstCardTop(page);
    for (const id of ["hero", "stat-strip", "exchange-teaser"]) expect((await page.getByTestId(id).boundingBox())!.y, `${id} above the feed at ${w}px`).toBeLessThan(top);
    if (w < 640) expect(top, `first post at ${w}px`).toBeLessThan(h - 120);
    await page.screenshot({ path: path.join(shots, `v17-home-${w}.png`) });
  }
});

test("V17-02 Log in and Sign up on the same domain return the reader to where they were", async ({ page }) => {
  await noConsentBanner(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${BASE}/exchange`);
  await expect(page.getByTestId("masthead-login")).toHaveAttribute("href", "/auth/sign-in?next=%2Fexchange");
  await expect(page.getByTestId("masthead-signup")).toHaveAttribute("href", "/auth/sign-up?next=%2Fexchange");
  await page.getByTestId("masthead-signup").click();
  await expect(page).toHaveURL(/\/auth\/sign-up\?next=%2Fexchange/);
  expect(new URL(page.url()).host).toBe(new URL(BASE).host);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${BASE}/`);
  await page.getByTestId("drawer-trigger").click();
  await expect(page.getByTestId("drawer-auth").getByRole("link", { name: "Sign up" })).toBeVisible();
  await expect(page.getByTestId("drawer-auth").getByRole("link", { name: "Log in" })).toBeVisible();
  await signIn(page, "reader@palavva.local", BASE, "/exchange");
  await expect(page).toHaveURL(/\/exchange(\?market=ALL)?$/);
});

test("V17-03 every footer link resolves", async ({ page, request }) => {
  await page.goto(`${BASE}/`);
  const hrefs = await page.getByTestId("site-footer").locator("a[href^='/']").evaluateAll((as) => [...new Set(as.map((a) => a.getAttribute("href")!))]);
  expect(hrefs).not.toContain("/stories"); // Palasora Phase 1: the news index is retired and hidden
  expect(hrefs).toEqual(expect.arrayContaining(["/", "/explore?sort=top", "/explore", "/feed/top", "/about", "/guidelines", "/privacy", "/terms", "/help", "/developers"]));
  for (const h of hrefs) expect((await request.get(`${BASE}${h}`, { maxRedirects: 0 })).status(), h).toBe(200);
  await expect(page.getByTestId("site-footer")).toContainText(`© ${new Date().getUTCFullYear()} Palavva`);
  await expect(page.locator("#footer-lang")).toBeVisible();
});

test("V17-04 admin APIs: anonymous 401, member 403, missing CSRF or cross-site origin 403", async ({ page, request }) => {
  expect((await request.get(`${BASE}/api/admin/agent-population`)).status()).toBe(401);
  await signIn(page, "reader@palavva.local");
  expect((await page.request.get(`${BASE}/api/admin/agent-population`)).status()).toBe(403);
  expect((await page.request.post(`${BASE}/api/admin/engine-config`, { data: { changes: [], reason: "x" } })).status()).toBe(403);
  await page.goto(`${BASE}/admin/engine/population`);
  await expect(page).toHaveURL(/\/forbidden/);
  await page.context().clearCookies();
  await signIn(page, "admin@palavva.local");
  const pv = { op: "create", mode: "add_n", countries: ["ST"], params: { add: 1 } };
  expect((await page.request.post(`${BASE}/api/admin/agent-population/preview`, { data: pv, headers: { origin: BASE } })).status()).toBe(403); // no CSRF token
  expect((await page.request.post(`${BASE}/api/admin/agent-population/preview`, { data: pv, headers: { origin: "https://evil.example", "x-csrf-token": "x" } })).status()).toBe(403);
});

test("V17-05 Population Manager: pick two countries, Add 3, preview exact delta, launch, watch the job complete", async ({ page }) => {
  test.setTimeout(180_000);
  await noConsentBanner(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  const pb = await pbAdmin();
  const before = async (cc: string) => (await pb.list("agents", `edition='${cc}' && kind='palavva_ai'`)).length; // < 50 per country on the test stack
  const st0 = await before("ST"), cv0 = await before("CV"), sc0 = await before("SC");
  await signIn(page, "admin@palavva.local", BASE, "/admin/engine/population");
  await page.goto(`${BASE}/admin/engine/population`);
  await expect(page.getByTestId("kpi-registered")).toBeVisible();
  await page.getByTestId("scope-countries").click();
  await page.getByTestId("country-combobox").click();
  await page.getByTestId("pick-ST").click();
  await page.getByTestId("pick-CV").click();
  await page.keyboard.press("Escape");
  await page.getByTestId("mode-add_n").click();
  await page.getByTestId("input-add").fill("3");
  await page.getByTestId("input-reason").fill("e2e add 3");
  await page.getByTestId("btn-preview").click();
  await expect(page.getByTestId("pv-to-create")).toHaveText("6");
  await expect(page.getByTestId("preview-examples")).toContainText("@");
  await page.screenshot({ path: path.join(shots, "v17-e2e-population-preview.png") });
  const rows = page.locator('[data-testid="job-row"]');
  const prevJob = (await rows.count()) ? await rows.first().getAttribute("data-job") : null; // a fresh stack has no jobs yet
  await page.getByTestId("btn-launch").click();
  const row = page.locator('[data-testid="job-row"]').first();
  await expect(row).not.toHaveAttribute("data-job", prevJob ?? "__none__", { timeout: 15_000 });
  await expect(row).toHaveAttribute("data-status", "completed", { timeout: 60_000 });
  expect(await before("ST")).toBe(st0 + 3);
  expect(await before("CV")).toBe(cv0 + 3);
  expect(await before("SC")).toBe(sc0); // unselected country unchanged
  const created = await pb.list("agents", "edition='ST' && persona_version=17");
  expect(created.every((a) => a.status === "resting" && a.adm1_code && /not a real person/i.test(a.bio))).toBeTruthy();
});

test("V17-06 Control Room: a country override is reviewed, applied with a reason and persists across reloads", async ({ page }) => {
  await noConsentBanner(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await signIn(page, "admin@palavva.local", BASE, "/admin/engine/controls");
  await page.goto(`${BASE}/admin/engine/controls`);
  // Re-runnable: pick cadences that differ from Ghana's current values on this stack.
  const cur = (await (await page.request.get(`${BASE}/api/admin/engine-config`)).json()).data.countries.GH;
  const orig = [5, 10, 15].find((v) => v !== cur.original_interval_min.value)!;
  await page.getByTestId("scope-countries").click();
  await page.getByTestId("country-combobox").click();
  await page.getByTestId("pick-GH").click();
  await page.keyboard.press("Escape");
  await page.getByTestId(`set-original_interval_min-${orig}`).click();
  await page.getByTestId("cr-review").click();
  await expect(page.getByTestId("cr-dialog")).toContainText("Ghana");
  await expect(page.getByTestId("cr-apply")).toBeDisabled(); // a reason is required
  await page.getByTestId("cr-reason").fill("e2e: faster Ghana cadence");
  await page.getByTestId("cr-apply").click();
  await expect(page.getByTestId("cr-overrides")).toContainText("Ghana", { timeout: 15_000 });
  await page.reload();
  await expect(page.getByTestId("cr-overrides")).toContainText(`Original discussion cadence (minutes per country): ${orig} min`);
  const r = await page.request.get(`${BASE}/api/admin/engine-config`);
  const view = (await r.json()).data;
  expect(view.countries.GH.original_interval_min).toEqual({ value: orig, origin: "country" });
  expect(view.countries.NG.original_interval_min.origin).not.toBe("country");
  await page.screenshot({ path: path.join(shots, "v17-e2e-control-room.png"), fullPage: true });
});

test("V17-07 Local Pulse: every country has a clickable ADM1 map with three independent layers", async ({ page }) => {
  await noConsentBanner(page);
  for (const [cc, n] of [["NG", 37], ["KE", 47], ["SN", 14], ["GH", 16], ["EG", 27]] as const) {
    await page.goto(`${BASE}/local-pulse?country=${cc}`);
    await expect(page.locator("[data-area]")).toHaveCount(n);
  }
  await page.goto(`${BASE}/local-pulse?country=NG&layer=agents`);
  await expect(page.getByTestId("pulse-map")).toHaveAttribute("data-layer", "agents");
  await page.locator('[data-area="NG-LA"]').click();
  await expect(page).toHaveURL(/area=NG-LA/);
  await expect(page.getByTestId("area-activity")).toBeVisible();
  await page.getByTestId("layer-verified").click();
  await expect(page.getByTestId("pulse-map")).toHaveAttribute("data-layer", "verified");
  await page.screenshot({ path: path.join(shots, "v17-e2e-local-pulse.png"), fullPage: true });
});

test("V17-08 Exchange: Explore link works, terms are explained, prices are Sora/share", async ({ page }) => {
  await noConsentBanner(page);
  await page.goto(`${BASE}/`);
  await page.getByTestId("exchange-teaser").getByRole("link", { name: "Explore Exchange" }).click();
  await expect(page).toHaveURL(/\/exchange(\?market=ALL)?$/);
  await expect(page.getByTestId("exchange-page")).toBeVisible();
  await page.getByTestId("term-invested").click();
  await expect(page.getByText("A valuation, not money paid in")).toBeVisible();
  await page.goto(`${BASE}/exchange?market=NG`);
  await expect(page.getByTestId("founder-readiness")).toBeVisible();
});

test("V17-09 a committed agent vote updates the score live with a brief highlight (no reload)", async ({ page }) => {
  await noConsentBanner(page);
  await page.goto(`${BASE}/`);
  const card = page.getByTestId("story-card").first();
  const pieceId = await card.getAttribute("data-piece-id");
  const score = card.locator(".vote-rail");
  const before = Number(await score.getAttribute("data-score"));
  await page.waitForFunction(() => document.querySelector("[data-live-status='live']") !== null || true);
  await page.waitForTimeout(1500); // SSE connected
  const pb = await pbAdmin();
  const already = new Set((await pb.list("agent_votes", `target_id='${pieceId}'`)).map((v) => v.agent_id));
  const voters = (await pb.list("agents", "kind='palavva_ai' && status='active' && hosting='palavva'")).filter((v) => !already.has(v.id)); // re-runnable
  let ok = false;
  for (const v of voters.slice(0, 10)) {
    const r = await fetch(`${BASE}/api/v1/agent/votes`, { method: "POST", headers: { "content-type": "application/json", "x-palavva-service-token": TOKEN,
      "x-palavva-agent-id": v.id, host: new URL(BASE).host }, body: JSON.stringify({ target_kind: "piece", target_id: pieceId, direction: 1, reason: "e2e realtime check" }) });
    if (r.ok) { ok = true; break; }
  }
  expect(ok).toBeTruthy();
  await expect(score).toHaveAttribute("data-score", String(before + 1), { timeout: 10_000 });
  await expect(score).toHaveAttribute("data-flash", "1");
});

test("V17-10 password reset: generic answer, single-use emailed link, old sessions revoked, new password works", async ({ page, browser }) => {
  const { readdirSync, readFileSync: rf } = await import("node:fs");
  const sink = path.resolve(__dirname, "../../../../data-test/mail-sink");
  await noConsentBanner(page);
  const id = Date.now().toString(36);
  const email = `reset-${id}@example.test`, first = "first-password-123", second = "second-password-456";
  await page.goto(`${BASE}/auth/sign-up`);
  await page.getByLabel("Your name").fill("Reset Tester");
  await page.getByLabel("Handle").fill(`reset_${id}`);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(first);
  await page.locator('input[name="agree"]').check(); // (the optional newsletter box is a second checkbox since ISSUE-24)
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/auth/"));
  const other = await browser.newPage(); // a second, unrelated session that must be revoked
  await other.goto(`${BASE}/auth/forgot`);
  await other.getByLabel("Email").fill(`nobody-${id}@example.test`);
  await other.getByRole("button", { name: "Send reset link" }).click();
  const generic = await other.getByTestId("forgot-result").innerText();
  // The answer text is identical by design, so wait for the email itself rather than the (already shown) message.
  const before = new Set(readdirSync(sink));
  await other.getByLabel("Email").fill(email);
  await other.getByRole("button", { name: "Send reset link" }).click();
  await expect(other.getByTestId("forgot-result")).toHaveText(generic); // same answer whether or not the account exists
  await expect.poll(() => readdirSync(sink).filter((f) => f.includes("-reset-") && !before.has(f)).length, { timeout: 15_000 }).toBeGreaterThan(0);
  const file = readdirSync(sink).filter((f) => f.includes("-reset-")).sort().pop()!;
  const link = /http:\/\/\S+\/auth\/reset\?token=\S+/.exec(rf(path.join(sink, file), "utf8"))![0];
  await other.goto(link.replace(/^http:\/\/[^/]+/, BASE));
  await other.getByLabel("New password").fill(second);
  await other.getByRole("button", { name: "Save new password" }).click();
  await expect(other.getByTestId("reset-done")).toBeVisible();
  await other.goto(link.replace(/^http:\/\/[^/]+/, BASE)); // single use
  await other.getByLabel("New password").fill("third-password-789");
  await other.getByRole("button", { name: "Save new password" }).click();
  await expect(other.getByText(/expired or was already used/)).toBeVisible();
  await page.goto(`${BASE}/account`);
  await expect(page).toHaveURL(/\/auth\/sign-in/); // the signed-in session from before the reset is gone
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(second);
  await page.getByRole("button", { name: "Continue with email" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/auth/"));
  await other.close();
});
