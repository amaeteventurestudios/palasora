// v1.8+ Phase 8 Command Center review: measures every admin route against the shared standards (heading, ninth-grade "?" help,
// configurable table page sizes, no endless unpaginated lists, no placeholder/dead text, named controls, accessibility) and writes
// docs/evidence/v18-plus/ADMIN-STANDARDS-AUDIT.json. Hard failures: HTTP errors, missing H1, unnamed buttons, axe "critical".
import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { readdirSync, statSync, writeFileSync } from "node:fs";
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

test("Phase 8 Command Center standards audit (all routes)", async ({ page }) => {
  const ROUTES = routes();
  test.setTimeout(ROUTES.length * 30_000);
  await noConsentBanner(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await signIn(page, "admin@palavva.local", BASE, "/admin");
  const report: Record<string, unknown>[] = [], hard: string[] = [];
  for (const r of ROUTES) {
    const res = await page.goto(`${BASE}${r}`);
    if (!res || res.status() >= 400) { hard.push(`${r}: HTTP ${res?.status()}`); continue; }
    await page.getByTestId("admin-content").waitFor();
    const m = await page.evaluate(() => {
      const c = document.querySelector('[data-testid="admin-content"]') as HTMLElement;
      const text = c.innerText;
      const tables = [...c.querySelectorAll("table")];
      // A DataTable root carries a data-testid and contains its own "rows per page" buttons (…-size-50 etc.).
      const inDataTable = (t: Element) => { let e: Element | null = t; for (let i = 0; i < 4 && e; i++) { e = e.parentElement?.closest("[data-testid]") ?? null; if (e?.querySelector('[data-testid$="-size-50"]')) return true; } return false; };
      return {
        h1: c.querySelectorAll("h1").length,
        help: c.querySelectorAll('[data-testid="help-tip"]').length,
        metrics: c.querySelectorAll('[data-testid="metric-card"], [data-testid="admin-metric"]').length,
        tables: tables.length,
        pagedTables: tables.filter(inDataTable).length,
        longRawTables: tables.filter((t) => !inDataTable(t) && t.querySelectorAll("tbody tr").length > 60).map((t) => t.querySelectorAll("tbody tr").length),
        pageSize100: !!c.querySelector('[data-testid$="-size-100"]'),
        placeholders: (text.match(/\b(TODO|lorem ipsum|placeholder|coming soon|not implemented)\b/gi) ?? []).slice(0, 5),
        unnamedButtons: [...c.querySelectorAll("button")].filter((b) => !(b.getAttribute("aria-label") || b.getAttribute("aria-labelledby") || b.textContent?.trim() || b.getAttribute("title") || (b as HTMLButtonElement).labels?.length)).length,
        narrowWrappers: [...c.querySelectorAll<HTMLElement>(":scope > * , :scope > * > *")].filter((e) => /max-w-(xl|2xl|3xl|4xl|5xl|screen-md|screen-lg)/.test(e.className) && e.getBoundingClientRect().width < c.clientWidth * 0.7).length,
      };
    });
    const axe = await new AxeBuilder({ page }).include('[data-testid="admin-content"]').withTags(["wcag2a", "wcag2aa"]).analyze();
    const serious = axe.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    const row = { route: r, ...m, axe_serious: serious.map((v) => `${v.id} (${v.nodes.length})`), axe_critical: serious.filter((v) => v.impact === "critical").map((v) => v.id) };
    report.push(row);
    if (!m.h1) hard.push(`${r}: no H1`);
    if (m.unnamedButtons) hard.push(`${r}: ${m.unnamedButtons} buttons without an accessible name`);
    if (row.axe_critical.length) hard.push(`${r}: axe critical ${row.axe_critical.join(", ")}`);
  }
  writeFileSync(path.resolve(__dirname, "../../../../docs/evidence/v18-plus/ADMIN-STANDARDS-AUDIT.json"), JSON.stringify({ generated: new Date().toISOString(), routes: report }, null, 2));
  expect(hard, hard.join("\n")).toEqual([]);
});
