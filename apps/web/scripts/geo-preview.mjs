import { chromium } from "@playwright/test";
import { readFileSync } from "node:fs";
const [iso, out] = process.argv.slice(2);
const d = JSON.parse(readFileSync(new URL(`../public/geo/${iso}.json`, import.meta.url)));
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${d.viewBox}" width="800">${d.areas.map((a) => `<path d="${a.d}" fill="#F8F5F0" stroke="#1B2030" stroke-width="1.5"/><text x="${a.cx}" y="${a.cy}" font-size="14" text-anchor="middle" fill="#C34218">${a.code.split("-")[1]}</text>`).join("")}</svg>`;
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 820, height: 700 } });
await p.setContent(`<body style="margin:0;background:#fff">${svg}</body>`); await p.screenshot({ path: out, fullPage: true }); await b.close();
