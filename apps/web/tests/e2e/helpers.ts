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
