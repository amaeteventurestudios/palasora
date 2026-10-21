import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { BASE, PASSWORD, SAMPLE, noConsentBanner, signIn } from "./helpers";

test.beforeEach(async ({ page }) => noConsentBanner(page));
// Palasora Phase 1: news threads (editorial discussions) are retired, so thread tests use a seeded agent original (e2e_fixtures).
const STORY = "/posts/e2e-original-ng-0";

// Palasora Phase 1 (doc 06 section 5): the v1.4 observer rule is gone. T-010/T-011 now prove people can reply and vote in
// their own name, labelled as people, through the UI and the API (abuse limits and moderation: phase1.spec.ts).
test("T-010 (Palasora) people reply: guests see a sign-in prompt, a signed-in person's reply appears labelled as a person", async ({ page }) => {
  await page.goto(STORY);
  await expect(page.getByTestId("observer-notice")).toHaveCount(0);
  await expect(page.getByTestId("human-reply-box")).toBeVisible();
  const before = await page.getByTestId("thread-counts").innerText();
  await signIn(page, "reader@palavva.local", BASE, STORY);
  const text = `A person's reply from the thread page (${Date.now().toString(36)}).`;
  await page.getByTestId("human-reply-box").getByLabel("Join the discussion").fill(text);
  await page.getByTestId("human-reply-box").getByRole("button", { name: "Post reply" }).click();
  const mine = page.getByTestId("human-post").filter({ hasText: text });
  await expect(mine).toBeVisible({ timeout: 15000 });
  await expect(mine.getByTestId("person-label")).toHaveText("Person");
  await page.reload();
  await expect(page.getByTestId("thread-counts")).not.toHaveText(before); // the reply was written
});

test("T-011 (Palasora) people vote: one vote per person (up, down, remove), recorded on the post's score", async ({ page }) => {
  await signIn(page, "reader@palavva.local", BASE, STORY);
  const id = (await (await page.request.get("/api/v1/stories/e2e-original-ng-0")).json()).data.id;
  const put = (direction: number) => page.request.put("/api/v1/votes", { data: { target_kind: "piece", target_id: id, direction }, headers: { origin: BASE } });
  const hits = await Promise.all(Array.from({ length: 3 }, () => put(1)));
  expect(hits.every((h) => h.status() === 200)).toBe(true); // concurrent double-submits are one vote
  const again = (await (await put(1)).json()).data;
  expect(again).toMatchObject({ status: "unchanged", direction: 1 }); // the same vote twice changes nothing
  const down = (await (await put(-1)).json()).data;
  expect(down).toMatchObject({ status: "recorded", direction: -1 });
  const up = (await (await put(1)).json()).data; // switching back moves exactly one vote from down to up
  expect(up.up - down.up).toBe(1);
  expect(down.down - up.down).toBe(1);
  expect((await (await put(0)).json()).data.direction).toBe(0);
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
  // Palasora Phase 1: anonymous people cannot write (sign in first); agent writes need an agent key.
  const anon = await request.post("/api/v1/comments", { data: { piece_id: "x", text: "hi" }, headers: { origin: BASE } });
  expect(anon.status()).toBe(401);
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
  await page.locator('input[name="agree"]').check(); // (the optional newsletter box is a second checkbox since ISSUE-24)
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
  const c = reader.getByTestId("agent-post").first(); // Palasora Phase 1: an agent reply on an agent original (news threads retired)
  const text = (await c.locator("div.whitespace-pre-line").innerText()).slice(0, 40);
  await c.getByText("Report", { exact: true }).click();
  await c.getByLabel("Reason").selectOption("misleading");
  await c.getByRole("button", { name: "Send report" }).click();
  await expect(c.getByText("Your report has been recorded")).toBeVisible();
  const mod = await (await browser.newContext()).newPage();
  await signIn(mod, "moderator@palavva.local", BASE, "/admin/moderation");
  const row = mod.locator("tr", { has: mod.getByRole("button", { name: "Quarantine" }) }).filter({ hasText: "misleading" }).first();
  await row.getByRole("button", { name: "Quarantine" }).click();
  await expect(async () => { await reader.reload(); await expect(reader.getByTestId("agent-post").filter({ hasText: text })).toHaveCount(0, { timeout: 1000 }); }).toPass({ timeout: 15000 });
  // ISSUE-23: the audit history lives in Settings & audit, which a Moderator cannot open (least privilege); check it as Super Admin.
  await mod.goto("/admin/settings"); await expect(mod).toHaveURL(/\/forbidden/);
  const sa = await (await browser.newContext()).newPage();
  await signIn(sa, "admin@palavva.local", BASE, "/admin/settings");
  await sa.getByTestId("audit-search").fill("quarantine"); // v1.8+ ISSUE-22: plain summaries; raw action in the drawer
  await expect(sa.getByTestId("audit").getByText("moderation report quarantine").first()).toBeVisible();
  await sa.context().close();
  await mod.goto("/admin/moderation?tab=quarantine"); // v1.8+ ISSUE-13: Trust & safety tabs
  const q = mod.locator("tr", { hasText: "quarantined" }).filter({ hasText: text.slice(0, 25) }).first();
  await q.getByRole("button", { name: "Restore" }).click();
  await expect(async () => { await reader.reload(); await expect(reader.getByTestId("agent-post").filter({ hasText: text })).toHaveCount(1, { timeout: 1000 }); }).toPass({ timeout: 15000 });
});
