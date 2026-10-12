import { describe, expect, it } from "vitest";
import { actionsFor, checkDecision, rankDirectory, type DirRow } from "../../lib/business/rules";

const admin = () => true, editorOnly = (r: string) => r === "editor";
const ev = [{ url: "https://rdb.rw/registry/12345", note: "registry entry matches name and owner" }];

describe("ISSUE-19 business verification", () => {
  it("needs a person with the right role, a note and real evidence; demo businesses can never be verified", () => {
    expect(checkDecision({ action: "verify", state: "unverified", isDemo: false, note: "Checked the official registry entry today", evidence: ev, can: admin })).toEqual({ ok: true, to: "verified" });
    expect(checkDecision({ action: "verify", state: "unverified", isDemo: true, note: "Checked the official registry entry today", evidence: ev, can: admin }).ok).toBe(false);
    expect(checkDecision({ action: "verify", state: "unverified", isDemo: false, note: "Checked the official registry entry today", evidence: [], can: admin }).ok).toBe(false);
    expect(checkDecision({ action: "verify", state: "unverified", isDemo: false, note: "Checked the official registry entry today", evidence: [{ url: "https://example.invalid/x", note: "" }], can: admin }).ok).toBe(false);
    expect(checkDecision({ action: "verify", state: "unverified", isDemo: false, note: "short", evidence: ev, can: admin }).ok).toBe(false);
    expect(checkDecision({ action: "verify", state: "unverified", isDemo: false, note: "Checked the official registry entry today", evidence: ev, can: editorOnly }).ok).toBe(false);
    expect(checkDecision({ action: "request_info", state: "unverified", isDemo: true, note: "Please send your registration number", evidence: [], can: editorOnly })).toEqual({ ok: true, to: "needs_info" });
    expect(checkDecision({ action: "suspend", state: "unverified", isDemo: false, note: "Complaint received about misleading claims", evidence: [], can: admin }).ok).toBe(false);
    expect(checkDecision({ action: "suspend", state: "verified", isDemo: false, note: "Complaint received about misleading claims", evidence: [], can: admin })).toEqual({ ok: true, to: "suspended" });
    expect(actionsFor("unverified", true)).not.toContain("verify");
    expect(actionsFor("verified", false)).toEqual(["suspend"]);
  });
  it("ranks verified first; a sponsored unverified business is not lifted; rejected and suspended are hidden; demo last", () => {
    const r = (id: string, state: DirRow["state"], o: Partial<DirRow> = {}): DirRow => ({ id, name: id, state, isDemo: false, created: "2026-10-01", sponsored: false, editorial: false, ...o });
    const { organic, sponsored } = rankDirectory([r("paid-unverified", "unverified", { sponsored: true, created: "2026-10-12" }), r("demo", "unverified", { isDemo: true }), r("v1", "verified", { created: "2026-10-05" }),
      r("gone", "rejected"), r("sus", "suspended"), r("paid-verified", "verified", { sponsored: true }), r("spot", "pending", { editorial: true })]);
    expect(organic.map((x) => x.id)).toEqual(["v1", "paid-verified", "spot", "paid-unverified", "demo"]); // same tier keeps newest first, then name
    expect(organic.slice(0, 2).map((x) => x.state)).toEqual(["verified", "verified"]);
    expect(organic.findIndex((x) => x.id === "paid-unverified")).toBeGreaterThan(organic.findIndex((x) => x.id === "spot"));
    expect(organic.at(-1)!.id).toBe("demo");
    expect(organic.map((x) => x.id)).not.toContain("gone");
    expect(organic.map((x) => x.id)).not.toContain("sus");
    expect(sponsored.map((x) => x.id)).toEqual(["paid-verified"]);
  });
});
