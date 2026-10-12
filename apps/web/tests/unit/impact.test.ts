import { describe, expect, it } from "vitest";
import { impactOf } from "../../lib/admin/impact";

const E = [{ from: "web", to: "pocketbase", why: "" }, { from: "editorial", to: "pocketbase", why: "" }, { from: "web", to: "editorial", why: "" }, { from: "pocketbase", to: "db", why: "" }];
describe("ISSUE-21 dependency impact", () => {
  it("walks dependents transitively", () => expect(impactOf("db", E).sort()).toEqual(["editorial", "pocketbase", "web"]));
  it("a leaf breaks nothing else", () => expect(impactOf("web", E)).toEqual([]));
});
