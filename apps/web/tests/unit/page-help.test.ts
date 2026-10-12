import { describe, expect, it } from "vitest";
import { readdirSync, statSync } from "node:fs";
import path from "node:path";
import { PAGE_HELP, helpFor } from "../../lib/admin/page-help";
import { moduleForPath } from "../../lib/access/permissions";

function routes(dir = path.resolve(__dirname, "../../app/admin"), prefix = "/admin"): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir)) { const p = path.join(dir, e); if (statSync(p).isDirectory()) { if (!/^[[(_]/.test(e)) out.push(...routes(p, `${prefix}/${e}`)); } else if (e === "page.tsx") out.push(prefix); }
  return out;
}
describe("Phase 8: every Command Center page explains itself and is guarded", () => {
  const R = routes();
  it("has a plain-English page help entry (what / why / what you can do)", () => {
    for (const r of R) { const h = helpFor(r); expect(h, r).not.toBeNull(); expect(h!.what.length).toBeGreaterThan(20); expect(h!.todo.length).toBeGreaterThan(10); }
    expect(Object.keys(PAGE_HELP).length).toBeGreaterThanOrEqual(R.length);
  });
  it("maps to a permission module (no admin page is left unguarded)", () => {
    for (const r of R) expect(moduleForPath(r), r).not.toBe("unmapped");
  });
});
