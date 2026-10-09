// Real-Qwen live conversation demo (A-06/A-12). Usage: node scripts/demo-live.mjs [maxMinutes]
import { chromium } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";
const BASE = "http://127.0.0.1:3000";
const pw = /^LOCAL_DEMO_PASSWORD=(.*)$/m.exec(readFileSync(new URL("../../../.env.local", import.meta.url), "utf8"))[1].trim();
const out = new URL("../../../docs/evidence/v13/", import.meta.url).pathname;
const maxMin = Number(process.argv[2] ?? 8);
const log = { started_at: new Date().toISOString(), base: BASE, arrivals: [], notes: [] };
const b = await chromium.launch();
const admin = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
await admin.addInitScript(() => localStorage.setItem("pv_consent", "denied"));
await admin.goto(`${BASE}/auth/sign-in?next=/admin/conversations`);
await admin.getByLabel("Email").fill("editor@palavva.local"); await admin.getByLabel("Password").fill(pw);
await admin.getByRole("button", { name: "Continue with email" }).click(); await admin.waitForURL((u) => u.pathname === "/admin/conversations");
await admin.getByRole("button", { name: "Admin: Run safe demo conversation" }).click();
await admin.getByText(/Demo topic published/).waitFor({ timeout: 30000 });
log.demo_clicked_at = new Date().toISOString();
await admin.reload();
const href = await admin.locator("table a[href^='/discussion/demo-conversation-cold-storage']").first().getAttribute("href");
log.thread_url = BASE + href;
await admin.screenshot({ path: out + "screens/admin-conversations-after-demo.png", fullPage: false });
const desk = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
const mob = await (await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage();
for (const p of [desk, mob]) { await p.addInitScript(() => localStorage.setItem("pv_consent", "denied")); await p.goto(log.thread_url); await p.evaluate(() => { window.__noReload = "same-document"; }); }
await desk.locator("#conversation").scrollIntoViewIfNeeded();
await desk.screenshot({ path: out + "screens/live-thread-desktop-0.png" });
const seen = new Set();
const deadline = Date.now() + maxMin * 60_000;
while (Date.now() < deadline && seen.size < 4) {
  const posts = await desk.locator("[data-testid=ai-post]").evaluateAll((els) => els.map((e) => ({ id: e.dataset.postId, parent: e.dataset.parentId, depth: Number(e.dataset.depth),
    role: e.querySelector("header a")?.textContent, time: e.querySelector("time")?.getAttribute("datetime"), isNew: !!e.querySelector("[aria-label='New reply']"), text: e.querySelector("div")?.textContent?.slice(0, 160) })));
  for (const p of posts) if (!seen.has(p.id)) {
    seen.add(p.id);
    const scrollBefore = await desk.evaluate(() => window.scrollY);
    log.arrivals.push({ ...p, observed_in_browser_at: new Date().toISOString(), arrived_without_reload: (await desk.evaluate(() => window.__noReload)) === "same-document", scrollY: scrollBefore });
    await desk.screenshot({ path: out + `screens/live-thread-desktop-${seen.size}.png`, fullPage: true });
  }
  await desk.waitForTimeout(2000);
}
log.mobile_ai_posts = await mob.locator("[data-testid=ai-post]").count();
log.mobile_no_reload = (await mob.evaluate(() => window.__noReload)) === "same-document";
log.mobile_overflow_px = await mob.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
await mob.locator("#conversation").scrollIntoViewIfNeeded();
await mob.screenshot({ path: out + "screens/live-thread-mobile.png", fullPage: false });
log.live_status = await desk.locator("[data-live-status]").getAttribute("data-live-status");
log.finished_at = new Date().toISOString();
writeFileSync(out + "demo-run.json", JSON.stringify(log, null, 1));
console.log(JSON.stringify({ url: log.thread_url, arrivals: log.arrivals.map((a) => [a.role, a.depth, a.observed_in_browser_at, a.arrived_without_reload]), mobile: log.mobile_ai_posts, overflow: log.mobile_overflow_px }, null, 1));
await b.close();
