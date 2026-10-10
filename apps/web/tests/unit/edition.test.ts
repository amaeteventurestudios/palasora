// v1.5 country edition correctness (release blocker): one scope rule shared by feed, rails, SSE and APIs.
import { describe, expect, it, vi } from "vitest";
vi.mock("../../lib/pb", () => ({ pb: {}, q: (s: string) => `'${s}'` }));
import { countryCodes, diversifyByCountry, inEdition, scopeOf, scopeLabel } from "../../lib/edition";
import { matches } from "../../lib/live-hub";
import { resolve } from "../../lib/i18n/context";

describe("edition scope", () => {
  it("registry has all 54 countries", () => expect(countryCodes()).toHaveLength(54));
  it("a South African story is NOT in the Liberia edition (reported defect)", () => {
    expect(scopeOf(["ZA"], "LR")).toBe("other");
    expect(inEdition(["ZA"], "LR")).toBe(false);
  });
  it("local, regional, pan-African", () => {
    expect(scopeOf(["LR"], "LR")).toBe("local");
    expect(scopeOf(["GH", "ZA"], "LR")).toBe("regional");
    expect(scopeOf([], "CM")).toBe("pan");
    expect(scopeOf(["KE"], "CM")).toBe("other");
    expect(scopeOf(["CF"], "CM")).toBe("regional"); // both Central Africa
  });
  it("cross-border story counts locally for each subject country", () => {
    expect(scopeOf(["SN", "GM"], "GM")).toBe("local");
    expect(scopeOf(["SN", "GM"], "SN")).toBe("local");
  });
  it("All Africa keeps everything", () => { expect(inEdition(["ZA"], "ALL")).toBe(true); expect(inEdition([], "ALL")).toBe(true); });
  it("labels name the region and the countries", () => {
    expect(scopeLabel("regional", ["GH"], "LR")).toBe("West Africa · Ghana");
    expect(scopeLabel("pan", [], "LR")).toBe("Pan-African");
  });
  it("All Africa diversity: no three consecutive items from one country", () => {
    const items = [..."NNNNNNZZG"].map((c) => ({ country_codes: [c === "N" ? "NG" : c === "Z" ? "ZA" : "GH"] }));
    const out = diversifyByCountry(items).map((x) => x.country_codes[0]);
    for (let i = 2; i < 6; i++) expect(out[i] === out[i - 1] && out[i] === out[i - 2]).toBe(false);
    expect(out).toHaveLength(9);
  });
});

describe("SSE edition filter", () => {
  const ev = (country_codes: string[], extra: Record<string, unknown> = {}) => ({ seq: 1, type: "reply_published", piece_id: "p1234567890", post_id: "", parent_id: "", author_kind: "agent",
    role_id: "", created: "", payload: {}, subpal_id: "", actor_agent_id: "", country_codes, agent_affinities: [] as string[], ...extra });
  it("never sends another region's event to a country stream", () => {
    expect(matches(ev(["ZA"]), undefined, "LR")).toBeNull();
    expect(matches(ev(["LR"]), undefined, "LR")).toBe("local");
    expect(matches(ev(["NG"]), undefined, "LR")).toBe("regional");
  });
  it("thread streams follow their thread only", () => {
    expect(matches(ev(["ZA"]), "p1234567890", "LR")).toBe("local");
    expect(matches(ev(["LR"]), "pzzzzzzzzzz", "LR")).toBeNull();
  });
  it("agent-only events need a declared affinity", () => {
    const a = ev([], { piece_id: "", actor_agent_id: "a1", agent_affinities: ["CM"] });
    expect(matches(a, undefined, "CM")).toBe("local");
    expect(matches(a, undefined, "LR")).toBeNull();
  });
});

describe("viewed edition vs saved home edition", () => {
  it("guest default is All Africa", () => expect(resolve({}, {}, null, null).edition).toBe("ALL"));
  it("viewing a country does not change the home edition", () => {
    const r = resolve({}, { edition: "NG" }, null, null, "LR");
    expect(r.edition).toBe("LR"); expect(r.home).toBe("NG"); expect(r.sources.edition).toBe("view");
  });
  it("saved home edition applies when nothing is being viewed", () => expect(resolve({}, { edition: "SN" }, null, null).edition).toBe("SN"));
});
