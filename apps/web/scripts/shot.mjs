// Usage: node scripts/shot.mjs <url> <out.png> [width] [height] [theme] [fullPage]
import { chromium } from "@playwright/test";
const [url, out, w = "1440", h = "900", theme = "light", full = "0"] = process.argv.slice(2);
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: +w, height: +h }, colorScheme: theme === "dark" ? "dark" : "light" });
await ctx.addInitScript(() => { try { localStorage.setItem("pv_consent", "denied"); } catch {} });
const page = await ctx.newPage();
await page.goto(url, { waitUntil: "networkidle" });
await page.screenshot({ path: out, fullPage: full === "1" });
const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
console.log(JSON.stringify({ out, overflowX: overflow }));
await browser.close();
