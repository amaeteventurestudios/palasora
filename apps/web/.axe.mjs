import { chromium } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
await ctx.addInitScript(() => { localStorage.setItem("pv_theme", "light"); localStorage.setItem("pv_consent", "denied"); });
const p = await ctx.newPage(); await p.goto("http://127.0.0.1:3000/?edition=ALL", { waitUntil: "load" });
const r = await new AxeBuilder({ page: p }).withRules(["color-contrast"]).analyze();
for (const v of r.violations) for (const n of v.nodes) console.log(n.target, n.any.map((a) => JSON.stringify(a.data)).join(" | "));
await b.close();
