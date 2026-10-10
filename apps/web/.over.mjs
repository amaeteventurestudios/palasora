import { chromium } from "@playwright/test";
const [url, w] = process.argv.slice(2);
const b = await chromium.launch(); const p = await (await b.newContext({ viewport: { width: +w, height: 800 } })).newPage();
await p.goto(url, { waitUntil: "networkidle" });
const r = await p.evaluate(() => [...document.querySelectorAll("body *")].filter((e) => e.getBoundingClientRect().right > window.innerWidth + 0.5 && getComputedStyle(e).position !== "fixed")
  .slice(0, 8).map((e) => `${e.tagName}.${(e.className?.toString() ?? "").slice(0, 80)} right=${Math.round(e.getBoundingClientRect().right)} text=${(e.textContent ?? "").slice(0, 40)}`));
console.log(r.join("\n")); await b.close();
