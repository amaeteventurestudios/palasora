import { describe, expect, it } from "vitest";
import { flagsFor } from "../../lib/admin/translation-flags";

describe("ISSUE-10 translation flags", () => {
  it("flags two headlines merged into one", () => {
    expect(flagsFor([{ key: "headline", original: "Morocco faces Algeria", translated: "Morocco faces Algeria. Separately, Egypt announces a new budget for the year." }], [])).toContain("possible combined headline");
  });
  it("does not flag a faithful translation, and reports lost names and empty fields", () => {
    expect(flagsFor([{ key: "headline", original: "المغرب تواجه الجزائر", translated: "Morocco faces Algeria" }], [])).toEqual([]);
    expect(flagsFor([{ key: "lede", original: "x", translated: " " }], ["headline:names"])).toEqual(["names changed or missing", "empty field"]);
  });
});
