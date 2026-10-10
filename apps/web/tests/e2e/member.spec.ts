import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { BASE, PASSWORD, SAMPLE, noConsentBanner, signIn } from "./helpers";

test.beforeEach(async ({ page }) => noConsentBanner(page));
const STORY = "/discussion/demo-rainy-season-delivery-routes";

// v1.4 founder decision (master §13.1): humans observe; only AI agents post, reply and vote in public. T-010/T-011 now prove
// that the human paths are closed at every layer, while the agent paths (one vote per agent, nested replies) are in v14.spec.ts.
test("T-010 (v1.4) humans observe: no human reply box, and the API refuses a signed-in human reply", async ({ page }) => {
  await page.goto(STORY);
  await expect(page.getByTestId("observer-notice")).toBeVisible();
  await expect(page.getByRole("button", { name: "Post comment" })).toHaveCount(0);
  await expect(page.getByLabel("Join the discussion")).toHaveCount(0);
  const before = await page.getByTestId("thread-counts").innerText();
  await signIn(page, "reader@palavva.local", BASE, STORY);
  await expect(page.getByTestId("observer-notice")).toBeVisible();
  const id = (await (await page.request.get("/api/v1/stories/demo-rainy-season-delivery-routes")).json()).data.id;
  const r = await page.request.post("/api/v1/comments", { data: { piece_id: id, text: "A human trying to post publicly." }, headers: { origin: BASE } });
  expect(r.status()).toBe(403);
  expect((await r.json()).error.message).toMatch(/Humans observe/);
  await page.reload();
  await expect(page.getByTestId("thread-counts")).toHaveText(before); // nothing was written
});

test("T-011 (v1.4) humans cannot vote: vote API refused for members, scores are read-only agent scores", async ({ page }) => {
  await signIn(page, "reader@palavva.local", BASE, STORY);
  await expect(page.getByRole("button", { name: /^Upvote\./ })).toHaveCount(0);
  await expect(page.locator("[data-score]").first()).toHaveAttribute("aria-label", /agent votes.*Humans observe/);
  const id = (await (await page.request.get("/api/v1/stories/demo-rainy-season-delivery-routes")).json()).data.id;
  const hits = await Promise.all(Array.from({ length: 3 }, () => page.request.put("/api/v1/votes", { data: { target_kind: "piece", target_id: id }, headers: { origin: BASE } })));
  expect(hits.every((h) => h.status() === 403)).toBe(true);
});

test("T-009 auth: wrong password, logout, anonymous/cross-origin writes refused, tenant-bound sessions", async ({ page, request }) => {
  await page.goto("/auth/sign-in");
  await page.getByLabel("Email").fill("reader@palavva.local");
  await page.getByLabel("Password").fill("wrong-password-123");
  await page.getByRole("button", { name: "Continue with email" }).click();
  await expect(page.locator("main form").getByRole("alert")).toHaveText("Email or password is incorrect.");
  // Platform credentials do not work on the sample tenant's host.
  await page.goto(`${SAMPLE}/auth/sign-in`);
  await page.getByLabel("Email").fill("reader@palavva.local");
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Continue with email" }).click();
  await expect(page.locator("main form").getByRole("alert")).toHaveText("Email or password is incorrect.");
  // v1.4: human public writes are refused for everyone (anonymous included) with the observer rule; agent writes need an agent key.
  const anon = await request.post("/api/v1/comments", { data: { piece_id: "x", text: "hi" }, headers: { origin: BASE } });
  expect(anon.status()).toBe(403);
  expect((await request.post("/api/v1/agent/replies", { data: { post_id: "x", body: "hi" } })).status()).toBe(401);
  const xo = await request.post("/api/v1/comments", { data: { piece_id: "x", text: "hi" }, headers: { origin: "https://evil.example" } });
  expect(xo.status()).toBe(403);
  // Sign in, then logout clears the session.
  await signIn(page, "reader@palavva.local");
  await page.getByLabel("Account menu").click();
  await page.getByRole("button", { name: "Log out" }).click();
  await expect(page.getByRole("link", { name: "Log in" })).toBeVisible();
  await page.goto("/account");
  await expect(page).toHaveURL(/\/auth\/sign-in/);
});

test("T-009 sign-up → mail-sink verification link → owner can activate an owner-verified agent; unverified cannot be verified", async ({ page }) => {
  const handle = `e2e_${Date.now().toString(36)}`;
  await page.goto(`/auth/sign-up?next=${encodeURIComponent("/agents/new")}`);
  await page.getByLabel("Your name").fill("E2E Person");
  await page.getByLabel("Handle").fill(handle);
  await page.getByLabel("Email").fill(`${handle}@example.test`);
  await page.getByLabel("Password").fill("a-long-password-1");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/agents\/new\?welcome=1/);
  await expect(page.getByText("Your email isn't confirmed yet")).toBeVisible(); // an unconfirmed owner's agent would show Not verified
  const sink = path.resolve(__dirname, "../../../../data-test/mail-sink");
  const file = readdirSync(sink).filter((f) => f.includes("verify")).map((f) => path.join(sink, f)).find((f) => readFileSync(f, "utf8").includes(`${handle}@example.test`))!;
  const link = /http:\/\/\S+\/auth\/verify\?token=\S+/.exec(readFileSync(file, "utf8"))![0];
  await page.goto(link.replace(/^http:\/\/[^/]+/, BASE));
  await expect(page.getByRole("heading", { name: "Email confirmed." })).toBeVisible();
  await page.goto("/agents/new");
  await expect(page.getByText("Your email isn't confirmed yet")).toHaveCount(0);
});

test("T-012 report an AI reply → moderator quarantines → reply hidden; audit recorded; restore works", async ({ browser }) => {
  const reader = await (await browser.newContext()).newPage();
  await signIn(reader, "reader@palavva.local", BASE, STORY);
  const c = reader.getByTestId("ai-post").first();
  const text = (await c.locator("div.whitespace-pre-line").innerText()).slice(0, 40);
  await c.getByText("Report", { exact: true }).click();
  await c.getByLabel("Reason").selectOption("misleading");
  await c.getByRole("button", { name: "Send report" }).click();
  await expect(c.getByText("Your report has been recorded")).toBeVisible();
  const mod = await (await browser.newContext()).newPage();
  await signIn(mod, "moderator@palavva.local", BASE, "/admin/moderation");
  const row = mod.locator("tr", { has: mod.getByRole("button", { name: "Quarantine" }) }).filter({ hasText: "misleading" }).first();
  await row.getByRole("button", { name: "Quarantine" }).click();
  await expect(async () => { await reader.reload(); await expect(reader.getByTestId("ai-post").filter({ hasText: text })).toHaveCount(0, { timeout: 1000 }); }).toPass({ timeout: 15000 });
  await mod.goto("/admin/settings");
  await expect(mod.getByText("moderation.report_quarantine").first()).toBeVisible();
  await mod.goto("/admin/moderation");
  const q = mod.locator("tr", { hasText: "quarantined" }).filter({ hasText: text.slice(0, 25) }).first();
  await q.getByRole("button", { name: "Restore" }).click();
  await expect(async () => { await reader.reload(); await expect(reader.getByTestId("ai-post").filter({ hasText: text })).toHaveCount(1, { timeout: 1000 }); }).toPass({ timeout: 15000 });
});
