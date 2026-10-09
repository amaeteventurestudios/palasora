import { readFileSync } from "node:fs";
import path from "node:path";
import type { Page } from "@playwright/test";

const envText = readFileSync(path.resolve(__dirname, "../../../../.env.test"), "utf8");
export const PASSWORD = /^LOCAL_DEMO_PASSWORD=(.*)$/m.exec(envText)![1].trim();
export const BASE = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3300";
export const SAMPLE = BASE.replace("127.0.0.1", "sample.localhost");

export async function noConsentBanner(page: Page) {
  await page.addInitScript(() => { try { localStorage.setItem("pv_consent", "denied"); } catch { /* */ } });
}

export async function signIn(page: Page, email: string, base = BASE, next = "/") {
  await page.goto(`${base}/auth/sign-in?next=${encodeURIComponent(next)}`);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Continue with email" }).click();
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
  };
}
