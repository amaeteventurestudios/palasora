// usage: node .shot-admin.mjs <out-dir> <width> <theme> <path> [path...]  (signs in as the local admin; password from env LOCAL_DEMO_PASSWORD)
import { chromium } from "@playwright/test";
const [out, w, theme, ...paths] = process.argv.slice(2);
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: +w, height: 1000 } });
await ctx.addInitScript((t) => { try { localStorage.setItem("pv_theme", t); localStorage.setItem("pv_consent", "declined"); } catch {} }, theme);
const p = await ctx.newPage();
await p.goto("http://127.0.0.1:3000/auth/sign-in?next=/admin", { waitUntil: "networkidle" });
await p.getByLabel("Email").fill("admin@palavva.local");
await p.getByLabel("Password").fill(process.env.LOCAL_DEMO_PASSWORD);
await p.getByRole("button", { name: "Continue with email" }).click();
await p.waitForURL((u) => !u.pathname.startsWith("/auth/"), { timeout: 90000 }).catch(() => {});
for (const path of paths) {
  const t0 = Date.now();
  await p.goto("http://127.0.0.1:3000" + path, { waitUntil: "networkidle", timeout: 120000 }).catch(() => {});
  await p.waitForTimeout(1200);
  const over = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  const name = path.replace(/[^a-z0-9]+/gi, "_").replace(/^_|_$/g, "") || "admin";
  await p.screenshot({ path: `${out}/${name}-${w}-${theme}.png`, fullPage: true });
  console.log(path, "ms", Date.now() - t0, "overflow", over, "errors", await p.locator("text=Application error").count());
}
await b.close();
