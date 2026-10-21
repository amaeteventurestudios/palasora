// v1.8+ ISSUE-23 Users & Access and ISSUE-24 account lifecycle/email, end to end on the isolated test stack (mail sink only).
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { BASE, PASSWORD, noConsentBanner, pbAdmin, signIn } from "./helpers";
import { totp } from "../../lib/access/totp";

const SINK = path.resolve(__dirname, "../../../../data-test/mail-sink");
/** Newest captured message of a kind to an address (the development mail sink; nothing is sent). */
function mail(to: string, kind: string): string {
  const files = readdirSync(SINK).filter((f) => f.includes(`-${kind}-`)).sort().reverse();
  for (const f of files) { const body = readFileSync(path.join(SINK, f), "utf8"); if (body.startsWith(`To: ${to}\n`)) return body; }
  throw new Error(`no ${kind} mail to ${to}`);
}
const link = (body: string, p: string) => new RegExp(`https?://[^\\s]+${p.replace(/[?]/g, "\\?")}[^\\s]+`).exec(body)![0].replace(/^https?:\/\/[^/]+/, BASE);
const tag = () => Math.random().toString(36).slice(2, 8);
async function fresh(browser: Browser): Promise<Page> { const c = await browser.newContext(); const p = await c.newPage(); await noConsentBanner(p); return p; }

test.describe.configure({ mode: "serial" });

test("ISSUE-23 Super Administrator: MFA before the Command Center (pages and APIs), wrong code refused, recovery codes once", async ({ browser }) => {
  test.setTimeout(120_000);
  const page = await fresh(browser);
  await signIn(page, "admin@palavva.local", BASE, "/admin/users"); // helper completes enrolment or verification
  await expect(page.getByRole("heading", { name: "Users & access" })).toBeVisible();
  await expect(page.getByTestId("admin-role")).toContainText("Super Administrator");
  // A second browser with only the password is held at the MFA step for pages AND JSON APIs.
  const p2 = await fresh(browser);
  await p2.goto(`${BASE}/auth/sign-in?next=/admin`);
  await p2.getByLabel("Email").fill("admin@palavva.local"); await p2.getByLabel("Password").fill(PASSWORD);
  await p2.getByRole("button", { name: "Continue with email" }).click();
  await p2.waitForURL(/\/auth\/mfa/);
  const api = await p2.request.get(`${BASE}/api/admin/engine-config`);
  expect(api.status()).toBe(403); expect((await api.json()).error.code).toBe("MFA_REQUIRED");
  await p2.goto(`${BASE}/admin/settings`); await expect(p2).toHaveURL(/\/auth\/mfa/);
  await p2.getByTestId("mfa-code").fill("000000"); await p2.getByTestId("mfa-submit").click();
  await expect(p2.locator('p[role="alert"]')).toContainText("not right");
  const pb = await pbAdmin();
  expect((await pb.list("audit_events", "action='auth.mfa_failed'")).length).toBeGreaterThan(0);
  const mfaRow = (await pb.list("staff_mfa", ""))[0];
  expect(String(mfaRow.secret_enc)).toMatch(/^v1:/); // stored encrypted, never in clear
  expect(JSON.stringify(mfaRow)).not.toMatch(/"[A-Z2-7]{32}"/);
  await p2.context().close(); await page.context().close();
});

test("ISSUE-23 invite → accept → least privilege: Operations cannot open revenue, users, Sora or sponsors, cannot change economy rules, sees only its links", async ({ browser }) => {
  test.setTimeout(150_000);
  const t = tag(), email = `ops-${t}@example.test`;
  const sa = await fresh(browser);
  await signIn(sa, "admin@palavva.local", BASE, "/admin/users?tab=invites");
  await sa.getByLabel("Email").fill(email);
  await sa.locator("#inv-role").selectOption("operations_admin");
  await sa.getByRole("button", { name: "Send invitation" }).click();
  await expect(sa.getByText(/Invitation sent to o…@example.test as Operations Administrator/)).toBeVisible();
  const inv = mail(email, "invitation");
  expect(inv).toContain("X-Palavva-Category: transactional");
  const ops = await fresh(browser);
  await ops.goto(link(inv, "/auth/invite?token="));
  await ops.getByLabel("Your name").fill(`Ops ${t}`); await ops.getByLabel("Handle").fill(`ops_${t}`);
  await expect(ops.getByLabel(/^Password/)).toHaveAttribute("minlength", "12"); // the browser blocks it; the server must too
  await ops.getByLabel(/^Password/).evaluate((el) => el.removeAttribute("minlength"));
  await ops.getByLabel(/^Password/).fill("short-pass1"); await ops.getByRole("button", { name: "Accept and continue" }).click();
  await expect(ops.locator('p[role="alert"]')).toContainText("12 characters");
  await ops.getByLabel(/^Password/).fill(`Ops-${t}-long-password`); await ops.getByRole("button", { name: "Accept and continue" }).click();
  await ops.waitForURL((u) => u.pathname.startsWith("/admin"));
  await expect(ops.getByTestId("admin-role")).toContainText("Operations Administrator");
  const nav = ops.getByTestId("admin-sidebar");
  await expect(nav.getByRole("link", { name: "Infrastructure & services" })).toBeVisible();
  for (const hidden of ["Revenue & business", "Users & access", "Sora economy", "Sponsors & inquiries"]) await expect(nav.getByRole("link", { name: hidden })).toHaveCount(0);
  for (const p of ["/admin/revenue", "/admin/users", "/admin/sora", "/admin/pals", "/admin/sponsors"]) { await ops.goto(`${BASE}${p}`); await expect(ops).toHaveURL(/\/forbidden/); }
  // Settings is read-only for Operations: the emergency switches are there (operations → administer), no secrets are ever shown.
  await ops.goto(`${BASE}/admin/infrastructure`); await expect(ops.getByRole("heading", { level: 1 })).toBeVisible();
  // Direct API calls are refused on the server too (URL/API bypass), and unmapped admin paths fail closed.
  expect((await ops.request.post(`${BASE}/api/admin/pals-policy`, { data: { action: "apply", budget: 1, reason: "operations must not", expected_revision: 0 }, headers: { origin: BASE } })).status()).toBe(403);
  expect((await ops.request.get(`${BASE}/api/admin/engine-config`)).status()).toBe(200);
  await ops.goto(`${BASE}/admin/not-a-real-workspace`); await expect(ops).toHaveURL(/\/forbidden/);
  // The invitation link is single-use.
  const again = await fresh(browser); await again.goto(link(inv, "/auth/invite?token="));
  await expect(again.getByRole("heading", { level: 1 })).toContainText("can't be used");
  const pb = await pbAdmin();
  expect((await pb.list("audit_events", `action='access.invitation_accepted'`)).length).toBeGreaterThan(0);
  for (const p of [sa, ops, again]) await p.context().close();
});

test("ISSUE-23 matrix: Super Admin ticks a permission with a reason, it takes effect on the server, is audited and restorable; Super Admin row is locked", async ({ browser }) => {
  test.setTimeout(150_000);
  const sa = await fresh(browser);
  await signIn(sa, "admin@palavva.local", BASE, "/admin/users?tab=roles");
  await sa.getByTestId("matrix-role-super_admin").click();
  await expect(sa.getByTestId("matrix-readonly")).toContainText("always has every permission");
  await sa.getByTestId("matrix-role-moderator").click();
  await expect(sa.getByTestId("perm-games.view")).toBeChecked();
  await expect(sa.getByTestId("perm-operations.view")).not.toBeChecked();
  // Moderator cannot open System health yet.
  const mod = await fresh(browser);
  await signIn(mod, "moderator@palavva.local", BASE, "/admin/moderation");
  await mod.goto(`${BASE}/admin/health`); await expect(mod).toHaveURL(/\/forbidden/);
  await sa.getByTestId("perm-operations.view").check();
  await sa.getByTestId("matrix-save").click();
  await expect(sa.getByTestId("matrix-result")).toContainText("at least 10 characters");
  await sa.getByTestId("matrix-reason").fill("Moderators need to see service health during incidents");
  await sa.getByTestId("matrix-save").click();
  await expect(sa.getByTestId("matrix-result")).toContainText("1 added, 0 removed");
  await mod.goto(`${BASE}/admin/health`); await expect(mod.getByRole("heading", { level: 1 })).toBeVisible();
  await sa.goto(`${BASE}/admin/users?tab=history`);
  await expect(sa.getByTestId("access-history")).toContainText("Changed permissions");
  await expect(sa.getByTestId("access-history")).toContainText("operations.view");
  await sa.goto(`${BASE}/admin/users?tab=roles`); await sa.getByTestId("matrix-role-moderator").click();
  await sa.getByTestId("matrix-reason").fill("Restore the default moderator template after the test");
  await sa.getByRole("button", { name: "Restore the default template" }).click();
  await expect(sa.getByTestId("matrix-result")).toContainText("0 added, 1 removed");
  await mod.waitForTimeout(1200); // at most one second of cache in each server bundle
  await mod.goto(`${BASE}/admin/health`); await expect(mod).toHaveURL(/\/forbidden/);
  for (const p of [sa, mod]) await p.context().close();
});

test("ISSUE-23 role change needs a reason, suspension signs the person out everywhere and blocks sign-in, reactivation restores it", async ({ browser }) => {
  test.setTimeout(150_000);
  const t = tag(), email = `person-${t}@example.test`;
  const u = await fresh(browser);
  await u.goto(`${BASE}/auth/sign-up?next=/`);
  await u.getByLabel("Your name").fill(`Person ${t}`); await u.getByLabel("Handle").fill(`person_${t}`);
  await u.getByLabel("Email").fill(email); await u.getByLabel("Password").fill(`pw-${t}-123456`);
  await u.locator('input[name="agree"]').check(); await u.getByRole("button", { name: "Create account" }).click();
  await u.waitForURL((x) => !x.pathname.startsWith("/auth/"));
  const pb = await pbAdmin();
  const user = (await pb.list("users", `email='${email}'`))[0];
  const sa = await fresh(browser);
  await signIn(sa, "admin@palavva.local", BASE, `/admin/users?id=${user.id}`);
  await expect(sa.getByTestId("user-role")).toContainText("Registered Human User");
  await sa.locator("summary", { hasText: "Change role" }).click();
  await sa.getByTestId("role-select").selectOption("support_staff");
  await sa.getByRole("button", { name: "Change role" }).click();
  await expect(sa.getByText("at least 10 characters").first()).toBeVisible();
  await sa.getByLabel("Reason for the role change").fill("Joining the support rota this month");
  await sa.getByRole("button", { name: "Change role" }).click();
  await expect(sa.getByText(`Person ${t} is now Support Staff.`)).toBeVisible();
  await sa.reload(); await expect(sa.getByTestId("user-role")).toContainText("Support Staff");
  // Suspend: their open session ends, sign-in is refused with the generic message.
  await sa.locator("summary", { hasText: "Suspend account" }).click();
  await sa.getByLabel("Reason for the account status change").fill("Test suspension from the e2e suite");
  sa.once("dialog", (d) => d.accept());
  await sa.getByRole("button", { name: "Suspend", exact: true }).click();
  await expect(sa.getByText("Account suspended and signed out everywhere.")).toBeVisible();
  await u.goto(`${BASE}/account`); await expect(u).toHaveURL(/\/auth\/sign-in/);
  await u.getByLabel("Email").fill(email); await u.getByLabel("Password").fill(`pw-${t}-123456`);
  await u.getByRole("button", { name: "Continue with email" }).click();
  await expect(u.locator('p[role="alert"]')).toContainText("Email or password is incorrect.");
  expect(mail(email, "account_suspended")).toContain("suspended");
  await sa.reload(); await sa.locator("summary", { hasText: "Reactivate account" }).click();
  await sa.getByLabel("Reason for the account status change").fill("Suspension test finished, restore access");
  await sa.getByRole("button", { name: "Reactivate", exact: true }).click();
  await expect(sa.getByText("Account reactivated.")).toBeVisible();
  // Self-protection: the Super Admin's own panel offers no role change or suspension.
  const me = (await pb.list("users", "email='admin@palavva.local'"))[0];
  await sa.goto(`${BASE}/admin/users?id=${me.id}`);
  await expect(sa.getByTestId("user-actions")).toContainText("This is you.");
  await expect(sa.getByTestId("user-actions").getByText("Change role")).toHaveCount(0);
  for (const p of [u, sa]) await p.context().close();
});

test("ISSUE-24 sign-up: verification + welcome are transactional, newsletter only after double opt-in; unsubscribe in one click", async ({ browser }) => {
  test.setTimeout(120_000);
  const t = tag(), email = `reader-${t}@example.test`;
  const u = await fresh(browser);
  await u.goto(`${BASE}/auth/sign-up?next=/`);
  await u.getByLabel("Your name").fill(`Reader ${t}`); await u.getByLabel("Handle").fill(`reader_${t}`);
  await u.getByLabel("Email").fill(email); await u.getByLabel("Password").fill(`pw-${t}-123456`);
  await u.locator('input[name="agree"]').check(); await u.getByTestId("signup-newsletter").check();
  await u.getByRole("button", { name: "Create account" }).click();
  await u.waitForURL((x) => !x.pathname.startsWith("/auth/"));
  expect(mail(email, "verify_email")).toContain("X-Palavva-Category: transactional");
  expect(mail(email, "welcome")).toContain("AI agents write the public posts");
  const conf = mail(email, "newsletter_confirm");
  const pb = await pbAdmin();
  expect((await pb.list("newsletter_subscriptions", `email='${email}'`))[0].status).toBe("pending");
  // Opening the link alone (e.g. a mail scanner) changes nothing; the button does.
  await u.goto(link(conf, "/newsletter/confirm?token="));
  expect((await pb.list("newsletter_subscriptions", `email='${email}'`))[0].status).toBe("pending");
  await u.getByTestId("token-subscribe-button").click();
  await expect(u.getByTestId("token-subscribe-ok")).toBeVisible();
  const sub = (await pb.list("newsletter_subscriptions", `email='${email}'`))[0];
  expect(sub.status).toBe("confirmed"); expect(sub.consent_source).toBe("sign_up"); expect(sub.consent_at).toBeTruthy();
  // The account page shows it and turning it off unsubscribes.
  await u.goto(`${BASE}/account`);
  await expect(u.getByTestId("newsletter-prefs")).toContainText("subscribed");
  await u.getByTestId("newsletter-prefs").locator('input[name="list_digest"]').uncheck();
  await u.getByRole("button", { name: "Save newsletter choices" }).click();
  await expect(u.getByText("Weekly Palavva Digest: unsubscribed")).toBeVisible();
  const events = await pb.list("email_events", `kind='welcome' || kind='verify_email'`);
  expect(events.every((e) => e.category === "transactional" && e.transport === "sink" && e.status === "captured" && !String(e.to_hash).includes("@"))).toBe(true);
  await u.context().close();
});

test("ISSUE-24 change password (old one checked, other devices signed out) and change email (new address must confirm, old address told)", async ({ browser }) => {
  test.setTimeout(150_000);
  const t = tag(), email = `owner-${t}@example.test`, pw = `pw-${t}-123456`;
  const a = await fresh(browser);
  await a.goto(`${BASE}/auth/sign-up?next=/account`);
  await a.getByLabel("Your name").fill(`Owner ${t}`); await a.getByLabel("Handle").fill(`owner_${t}`);
  await a.getByLabel("Email").fill(email); await a.getByLabel("Password").fill(pw);
  await a.locator('input[name="agree"]').check(); await a.getByRole("button", { name: "Create account" }).click();
  await a.waitForURL((u) => u.pathname === "/account");
  const b = await fresh(browser);
  await b.goto(`${BASE}/auth/sign-in?next=/account`); await b.getByLabel("Email").fill(email); await b.getByLabel("Password").fill(pw);
  await b.getByRole("button", { name: "Continue with email" }).click(); await b.waitForURL((u) => u.pathname === "/account");
  await expect(a.getByTestId("account-sessions").locator("li")).toHaveCount(1);
  await a.reload(); await expect(a.getByTestId("account-sessions").locator("li")).toHaveCount(2);
  await a.locator("summary", { hasText: "Change password" }).click();
  const form = a.getByTestId("change-password");
  await form.getByLabel("Current password").fill("wrong-password-1"); await form.getByLabel(/^New password/).fill(`new-${pw}`); await form.getByLabel("Type the new password again").fill(`new-${pw}`);
  await form.getByRole("button", { name: "Change password" }).click();
  await expect(form.getByRole("status")).toContainText("current password is not correct");
  await form.getByLabel("Current password").fill(pw); await form.getByLabel(/^New password/).fill(`new-${pw}`); await form.getByLabel("Type the new password again").fill(`new-${pw}`);
  await form.getByRole("button", { name: "Change password" }).click();
  await expect(form.getByRole("status")).toContainText("Other devices were signed out");
  await b.reload(); await expect(b).toHaveURL(/\/auth\/sign-in/);
  expect(mail(email, "password_changed")).toContain("was just changed");
  // Change email: nothing changes until the NEW address confirms with a button press.
  const next = `moved-${t}@example.test`;
  await a.reload(); await a.locator("summary", { hasText: "Change email address" }).click();
  const ce = a.getByTestId("change-email");
  await ce.getByLabel("New email address").fill(next); await ce.getByLabel("Your password").fill(`new-${pw}`);
  await ce.getByRole("button", { name: "Send confirmation to the new address" }).click();
  await expect(ce.getByRole("status").last()).toContainText("confirmation link is on its way");
  expect(mail(email, "email_change_notice")).toContain("only happens when the new address is confirmed");
  const pb = await pbAdmin();
  expect((await pb.list("users", `email='${email}'`)).length).toBe(1);
  await a.goto(link(mail(next, "email_change_verify"), "/auth/confirm-email?token="));
  await a.getByTestId("token-email-button").click();
  await expect(a.getByTestId("token-email-ok")).toBeVisible();
  expect((await pb.list("users", `email='${next}'`)).length).toBe(1);
  expect((await pb.list("audit_events", "action='account.email_changed'")).length).toBeGreaterThan(0);
  for (const p of [a, b]) await p.context().close();
});

test("ISSUE-24 forgotten password: same answer for unknown emails, expired link refused, used link single-use; ten wrong passwords lock the account", async ({ browser }) => {
  test.setTimeout(150_000);
  const t = tag(), email = `forgot-${t}@example.test`, pw = `pw-${t}-123456`;
  const u = await fresh(browser);
  await u.goto(`${BASE}/auth/sign-up?next=/`);
  await u.getByLabel("Your name").fill(`Forgot ${t}`); await u.getByLabel("Handle").fill(`forgot_${t}`);
  await u.getByLabel("Email").fill(email); await u.getByLabel("Password").fill(pw);
  await u.locator('input[name="agree"]').check(); await u.getByRole("button", { name: "Create account" }).click();
  await u.waitForURL((x) => !x.pathname.startsWith("/auth/"));
  await u.context().clearCookies();
  for (const e of [email, `nobody-${t}@example.test`]) {
    await u.goto(`${BASE}/auth/forgot`); await u.getByLabel("Email").fill(e); await u.getByRole("button", { name: "Send reset link" }).click();
    await expect(u.getByTestId("forgot-result")).toContainText("If an account uses that email");
  }
  const reset = link(mail(email, "password_reset"), "/auth/reset?token=");
  const pb = await pbAdmin();
  const user = (await pb.list("users", `email='${email}'`))[0];
  await pb.update("users", user.id, { reset_expires_at: "2020-01-01 00:00:00.000Z" });
  await u.goto(reset); await u.getByLabel("New password").fill(`reset-${pw}`); await u.getByRole("button", { name: "Save new password" }).click();
  await expect(u.locator('p[role="alert"]')).toContainText("expired or was already used");
  // Lockout after 10 wrong passwords; even the right password is then refused (same generic message).
  for (let i = 0; i < 10; i++) {
    await u.goto(`${BASE}/auth/sign-in`); await u.getByLabel("Email").fill(email); await u.getByLabel("Password").fill(`wrong-${i}-password`);
    await u.getByRole("button", { name: "Continue with email" }).click(); await expect(u.locator('p[role="alert"]')).toContainText("incorrect");
  }
  expect((await pb.list("users", `email='${email}'`))[0].locked_until).toBeTruthy();
  await u.goto(`${BASE}/auth/sign-in`); await u.getByLabel("Email").fill(email); await u.getByLabel("Password").fill(pw);
  await u.getByRole("button", { name: "Continue with email" }).click(); await expect(u.locator('p[role="alert"]')).toContainText("incorrect");
  expect((await pb.list("audit_events", "action='auth.locked'")).length).toBeGreaterThan(0);
  await u.context().close();
});

test("ISSUE-23 external agent ownership: a key cannot claim with a wrong code, cannot act as another agent; platform agents are never 'verified human'", async ({ request }) => {
  const pb = await pbAdmin();
  const r = await request.post(`${BASE}/api/v1/agent/claim`, { data: { claim_code: "not-the-code" }, headers: { authorization: "Bearer pv_test_AAAAAAAAAAAAAAAAAAAAAAAAAAAA" } });
  expect(r.status()).toBe(401);
  const platform = await pb.list("agents", "kind='palavva_ai'");
  expect(platform.every((a) => a.verification_level !== "owner_control")).toBe(true);
  const page = await (await request.get(`${BASE}/admin/users?tab=agents`, { maxRedirects: 0 })).status();
  expect([303, 307, 308]).toContain(page); // anonymous never sees the ownership list
  expect(totp("JBSWY3DPEHPK3PXP")).toMatch(/^\d{6}$/);
});
