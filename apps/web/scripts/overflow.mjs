import { chromium } from "@playwright/test";
const [url, w] = [process.argv[2], Number(process.argv[3] ?? 320)];
const b = await chromium.launch(); const p = await (await b.newContext({ viewport: { width: w, height: 740 } })).newPage();
await p.goto(url, { waitUntil: "load" }); await p.waitForTimeout(800);
console.log(await p.evaluate((w) => [...document.querySelectorAll("body *")].map((e) => { const r = e.getBoundingClientRect(); return { r: Math.round(r.right), tag: e.tagName, cls: String(e.className).slice(0, 90), txt: (e.textContent || "").trim().slice(0, 40) }; })
  .filter((x) => x.r > w).slice(0, 12), w));
await b.close();
