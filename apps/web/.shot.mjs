// usage: node shot.mjs <url> <out.png> [width] [height] [theme] [fullPage]
import { chromium } from "@playwright/test";
const [url, out, w = "1440", h = "1100", theme = "dark", full = "0"] = process.argv.slice(2);
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: +w, height: +h }, deviceScaleFactor: 1 });
await ctx.addInitScript((t) => { try { localStorage.setItem("pv_theme", t); localStorage.setItem("pv_consent", "declined"); } catch {} }, theme);
const p = await ctx.newPage();
await p.goto(url, { waitUntil: "networkidle", timeout: 60000 }).catch(() => {});
await p.waitForTimeout(800);
const over = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
await p.screenshot({ path: out, fullPage: full === "1" });
console.log(out, "horizontal overflow px:", over);
await b.close();
