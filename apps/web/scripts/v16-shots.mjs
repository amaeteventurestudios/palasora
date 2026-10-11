// v1.6 evidence capture against the LOCAL dev stack (http://127.0.0.1:3000). Signs in as the seeded local admin
// (password from the git-ignored .env.local, never printed), captures pages at desktop and phone widths in light and
// dark, and records horizontal overflow for each capture. Usage: node scripts/v16-shots.mjs [label] [path ...]
import { chromium } from "@playwright/test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "../../..");
const env = readFileSync(path.join(ROOT, ".env.local"), "utf8");
const PASSWORD = /^LOCAL_DEMO_PASSWORD=(.*)$/m.exec(env)[1].trim().replace(/^'|'$/g, "");
const BASE = process.env.BASE ?? "http://127.0.0.1:3000";
const OUT = path.join(ROOT, "docs/evidence/v16/screenshots");
mkdirSync(OUT, { recursive: true });
const [label = "run", ...paths] = process.argv.slice(2);
const targets = paths.length ? paths : ["/admin/engine?w=1h", "/admin/engine?w=6h&country=GH", "/?edition=NG", "/?edition=SN", "/?edition=EG"];
const sizes = [[1440, 900], [390, 844]];
const results = [];
const browser = await chromium.launch();
for (const theme of ["light", "dark"]) {
  const ctx = await browser.newContext({ colorScheme: theme });
  const page = await ctx.newPage();
  await page.addInitScript(() => { try { localStorage.setItem("pv_consent", "denied"); } catch { /* */ } });
  await page.goto(`${BASE}/auth/sign-in?next=/admin`);
  await page.getByLabel("Email").fill("admin@palavva.local");
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Continue with email" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/auth/"), { timeout: 30000 });
  for (const t of targets) {
    for (const [w, h] of sizes) {
      await page.setViewportSize({ width: w, height: h });
      const t0 = Date.now();
      const r = await page.goto(`${BASE}${t}`, { waitUntil: "load", timeout: 90000 });
      await page.waitForTimeout(2500);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      const name = `${label}-${t.replace(/[^a-z0-9]+/gi, "_").replace(/^_|_$/g, "") || "home"}-${w}-${theme}.png`;
      await page.screenshot({ path: path.join(OUT, name), fullPage: w > 500 });
      results.push({ path: t, width: w, theme, status: r?.status(), ms: Date.now() - t0, overflow, file: name });
      console.log(JSON.stringify(results.at(-1)));
    }
  }
  await ctx.close();
}
await browser.close();
writeFileSync(path.join(OUT, `${label}-results.json`), JSON.stringify(results, null, 2));
