// v1.8+ ISSUE-04: every Command Center route uses the full available width (Event Pipeline is the reference), has no
// sideways page scroll at phone/desktop/4K sizes, and metric cards survive 9-digit values without clipping.
// Routes are discovered from app/admin/**/page.tsx, so new admin pages are covered automatically.
import { expect, test } from "@playwright/test";
import { readdirSync, statSync } from "node:fs";
import path from "node:path";
import { BASE, noConsentBanner, signIn } from "./helpers";

const ADMIN = path.resolve(__dirname, "../../app/admin");
function routes(dir = ADMIN, prefix = "/admin"): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir)) {
    const p = path.join(dir, e);
    if (statSync(p).isDirectory()) { if (!e.startsWith("[") && !e.startsWith("(") && !e.startsWith("_")) out.push(...routes(p, `${prefix}/${e}`)); }
    else if (e === "page.tsx") out.push(prefix);
  }
  return out.sort();
}
const ROUTES = routes();
const shots = path.resolve(__dirname, "../../../../docs/evidence/v18-plus/BEFORE-AFTER/admin");

test.describe.configure({ mode: "serial" });

test("ISSUE-04 route discovery found the Command Center", () => {
  expect(ROUTES.length).toBeGreaterThanOrEqual(30);
  expect(ROUTES).toContain("/admin/analytics");
});

for (const [w, h] of [[390, 844], [1440, 900], [2560, 1440]] as const) {
  test(`ISSUE-04 every admin route at ${w}px: full width, no sideways scroll, 9-digit values fit`, async ({ page }) => {
    test.setTimeout(ROUTES.length * 20_000);
    await noConsentBanner(page);
    await page.setViewportSize({ width: w, height: h });
    await signIn(page, "admin@palavva.local", BASE, "/admin");
    const problems: string[] = [];
    for (const r of ROUTES) {
      const res = await page.goto(`${BASE}${r}`);
      if (!res || res.status() >= 400) { problems.push(`${r}: HTTP ${res?.status()}`); continue; }
      const content = page.getByTestId("admin-content");
      await content.waitFor();
      const m = await page.evaluate(() => {
        const c = document.querySelector('[data-testid="admin-content"]') as HTMLElement;
        const cs = getComputedStyle(c);
        const inner = c.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
        const kids = [...c.children].filter((k) => (k as HTMLElement).offsetHeight > 0) as HTMLElement[];
        const main = kids.reduce((a, k) => (k.offsetHeight > (a?.offsetHeight ?? 0) ? k : a), kids[0]);
        // Stress: write a 9-digit figure into every metric value and look for clipped cards.
        const vals = [...document.querySelectorAll<HTMLElement>("[data-testid] [data-value]")];
        for (const v of vals) v.textContent = "1,000,000,000";
        const clipped = vals.filter((v) => { const card = v.closest("[data-slot=card], .card") as HTMLElement | null; return card && card.scrollWidth > card.clientWidth + 1; }).length;
        return { inner, main: main?.getBoundingClientRect().width ?? 0, overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth, clipped, vals: vals.length };
      });
      if (m.overflow > 0) problems.push(`${r}: page scrolls sideways by ${m.overflow}px`);
      if (m.main < m.inner * 0.95) problems.push(`${r}: main block ${Math.round(m.main)}px of ${Math.round(m.inner)}px available`);
      if (m.clipped) problems.push(`${r}: ${m.clipped}/${m.vals} metric cards clip a 9-digit value`);
      if (w !== 390) await page.screenshot({ path: path.join(shots, `${r.replace(/\//g, "_").slice(1)}-${w}.png`) });
    }
    expect(problems, problems.join("\n")).toEqual([]);
  });
}
