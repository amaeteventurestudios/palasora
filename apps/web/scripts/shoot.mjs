// Real-browser screenshots of the running local app (evidence only; no mock content).
// Usage: node scripts/shoot.mjs <outDir> <path1,path2,...> [base=http://127.0.0.1:3000]
import { chromium } from "@playwright/test";
const [out, paths, base = "http://127.0.0.1:3000"] = process.argv.slice(2);
const b = await chromium.launch();
for (const theme of ["light", "dark"]) {
  for (const [w, h, tag] of [[1440, 1000, "1440"], [375, 812, "375"]]) {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, colorScheme: theme, deviceScaleFactor: 1 });
    await ctx.addInitScript((t) => { try { localStorage.setItem("pv_theme", t); localStorage.setItem("pv_consent", "essential"); } catch {} }, theme);
    const p = await ctx.newPage();
    for (const path of paths.split(",")) {
      await p.goto(base + path, { waitUntil: "load", timeout: 30000 }).catch(() => {});
      await p.waitForTimeout(1200);
      const name = (path === "/" ? "home" : path.replace(/^\//, "").replace(/[/?=&]/g, "_")) + `-${tag}-${theme}.png`;
      await p.screenshot({ path: `${out}/${name}`, fullPage: false });
      const overflow = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      console.log(name, overflow > 1 ? `HORIZONTAL OVERFLOW ${overflow}px` : "ok");
    }
    await ctx.close();
  }
}
await b.close();
