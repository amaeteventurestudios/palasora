import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { totp } from "../../lib/access/totp";
import path from "node:path";
import { expect, type Page } from "@playwright/test";

const envText = readFileSync(path.resolve(__dirname, "../../../../.env.test"), "utf8");
export const PASSWORD = /^LOCAL_DEMO_PASSWORD=(.*)$/m.exec(envText)![1].trim();
export const BASE = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3300";
export const SAMPLE = BASE.replace("127.0.0.1", "sample.localhost");

export async function noConsentBanner(page: Page) {
  await page.addInitScript(() => { try { localStorage.setItem("pv_consent", "denied"); } catch { /* */ } });
}

// ISSUE-23: staff roles that need MFA land on /auth/mfa after the password. The helper completes it like a person with an
// authenticator app would: on first visit it reads the setup key from the page and keeps it in data-test/ (disposable, reset with
// the test stack); later visits compute the current code from that key. Codes are never reused within a 30-second step.
const MFA_FILE = path.resolve(__dirname, "../../../../data-test/e2e-mfa.json");
const mfaKeys = (): Record<string, string> => (existsSync(MFA_FILE) ? JSON.parse(readFileSync(MFA_FILE, "utf8")) : {});
const usedStep: Record<string, number> = {};
export async function completeMfa(page: Page, email: string) {
  const key = `${new URL(page.url()).host}|${email}`;
  if (await page.getByTestId("mfa-start").isVisible().catch(() => false)) {
    await page.getByTestId("mfa-start").click();
    const secret = (await page.getByTestId("mfa-secret").innerText()).trim();
    writeFileSync(MFA_FILE, JSON.stringify({ ...mfaKeys(), [key]: secret }));
  }
  const secret = mfaKeys()[key];
  if (!secret) throw new Error(`no stored MFA key for ${key}; reset the test stack`);
  let step = Math.floor(Date.now() / 30_000);
  if (usedStep[key] === step) { await page.waitForTimeout(30_000 - (Date.now() % 30_000) + 200); step = Math.floor(Date.now() / 30_000); }
  usedStep[key] = step;
  await page.getByTestId("mfa-code").fill(totp(secret));
  await page.getByTestId("mfa-trust").check();
  await page.getByTestId("mfa-submit").click();
  const codes = page.getByTestId("mfa-continue");
  await page.waitForURL((u) => !u.pathname.startsWith("/auth/mfa") || false, { timeout: 4000 }).catch(async () => { if (await codes.isVisible()) await codes.click(); });
  await page.waitForURL((u) => !u.pathname.startsWith("/auth/"));
  const trust = (await page.context().cookies()).find((c) => c.name === "pv_mfa_trust");
  if (trust) writeFileSync(MFA_FILE, JSON.stringify({ ...mfaKeys(), [`trust|${key}`]: trust.value }));
}

export async function signIn(page: Page, email: string, base = BASE, next = "/") {
  const trusted = mfaKeys()[`trust|${new URL(base).host}|${email}`];
  if (trusted) await page.context().addCookies([{ name: "pv_mfa_trust", value: trusted, url: base, httpOnly: true, sameSite: "Strict" }]);
  await page.goto(`${base}/auth/sign-in?next=${encodeURIComponent(next)}`);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Continue with email" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/auth/sign-in"));
  await page.waitForLoadState("networkidle").catch(() => {});
  if (new URL(page.url()).pathname.startsWith("/auth/mfa")) await completeMfa(page, email);
  await page.waitForURL((u) => !u.pathname.startsWith("/auth/"));
}

export const shotDir = path.resolve(__dirname, "../../../../docs/evidence/screenshots");

// Superuser access to the TEST stack's PocketBase (127.0.0.1:8390) for time-travel style assertions.
const envVal = (k: string) => new RegExp(`^${k}=(.*)$`, "m").exec(envText)?.[1].trim().replace(/^'|'$/g, "") ?? "";
export async function pbAdmin() {
  const url = envVal("PB_URL") || "http://127.0.0.1:8390";
  const auth = await (await fetch(`${url}/api/collections/_superusers/auth-with-password`, { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ identity: envVal("PB_SERVICE_EMAIL"), password: envVal("PB_SERVICE_PASSWORD") }) })).json();
  const h = { authorization: auth.token, "content-type": "application/json" };
  return {
    list: async (coll: string, filter: string) => (await (await fetch(`${url}/api/collections/${coll}/records?perPage=50&sort=-created&filter=${encodeURIComponent(filter)}`, { headers: h })).json()).items as Record<string, any>[],
    update: async (coll: string, id: string, data: Record<string, unknown>) => (await fetch(`${url}/api/collections/${coll}/records/${id}`, { method: "PATCH", headers: h, body: JSON.stringify(data) })).json(),
    create: async (coll: string, data: Record<string, unknown>) => (await fetch(`${url}/api/collections/${coll}/records`, { method: "POST", headers: h, body: JSON.stringify(data) })).json(),
  };
}

// v1.5 shadcn masthead controls (EditionPicker = Popover + Command; LanguagePicker = Popover + Select).
export async function chooseEdition(page: Page, code: string, opts: { save?: boolean } = {}) {
  await page.getByTestId("edition-menu").click();
  if (opts.save) await page.getByTestId("edition-save").click();
  await page.getByTestId(`edition-opt-${code}`).click();
  await page.locator(`html[data-edition="${code}"]`).waitFor({ timeout: 20000 });
}
export async function setLanguages(page: Page, ui: string, reading: string) {
  const names: Record<string, RegExp> = { en: /^English/, fr: /^Français/, ar: /^العربية/, pcm: /^Naij|Pidgin/ };
  // The popover only opens once the masthead has hydrated; under full-suite load the first click can land earlier.
  await expect(async () => {
    if (!(await page.locator("#pref-ui").isVisible())) await page.getByTestId("prefs-menu").click();
    await expect(page.locator("#pref-ui")).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 20000 });
  await page.locator("#pref-ui").click();
  await page.getByRole("option", { name: names[ui] }).click();
  await page.locator("#pref-rd").click();
  await page.getByRole("option", { name: names[reading] }).first().click();
  await page.getByTestId("prefs-save").click();
  await page.locator(`html[lang="${ui}"]`).waitFor({ timeout: 20000 });
}
