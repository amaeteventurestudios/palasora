// Screenshots of the dev Command Center (real data) for the morning report. Usage: node scripts/shot-admin.mjs
import { chromium } from "@playwright/test";
import { readFileSync } from "node:fs";
const pw = /^LOCAL_DEMO_PASSWORD=(.*)$/m.exec(readFileSync(new URL("../../../.env.local", import.meta.url), "utf8"))[1].trim();
const out = new URL("../../../docs/evidence/screenshots/", import.meta.url).pathname;
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.addInitScript(() => localStorage.setItem("pv_consent", "denied"));
const p = await ctx.newPage();
await p.goto("http://127.0.0.1:3000/auth/sign-in?next=/admin/editorial");
await p.getByLabel("Email").fill("editor@palavva.local"); await p.getByLabel("Password").fill(pw);
await p.getByRole("button", { name: "Continue with email" }).click(); await p.waitForURL((u) => u.pathname.startsWith("/admin"));
await p.screenshot({ path: out + "dev-real-editorial-queue-1440.png" });
const links = p.locator("table a");
for (let i = 0; i < Math.min(await links.count(), 2); i++) {
  await p.goto("http://127.0.0.1:3000/admin/editorial"); await p.locator("table a").nth(i).click();
  await p.waitForSelector("text=Claims and evidence");
  await p.screenshot({ path: out + `dev-real-draft-review-${i + 1}-1440.png`, fullPage: true });
}
for (const [path, name] of [["/admin", "overview"], ["/admin/ai", "ai"], ["/admin/sources", "sources"]]) {
  await p.goto("http://127.0.0.1:3000" + path); await p.screenshot({ path: out + `dev-real-${name}-1440.png`, fullPage: name !== "overview" });
}
await b.close(); console.log("ok");
