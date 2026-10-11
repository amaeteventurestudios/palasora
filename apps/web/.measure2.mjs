import { chromium } from "@playwright/test";
const b = await chromium.launch(); const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
await p.goto(process.argv[2], { waitUntil: "load" });
for (const id of ["hero", "stat-strip", "exchange-teaser", "feed-tabs", "mode-explain", "story-card"]) { const bb = await p.getByTestId(id).first().boundingBox(); console.log(id, bb && Math.round(bb.y), bb && Math.round(bb.height)); }
console.log(await p.getByTestId("stat-strip").innerText());
await b.close();
