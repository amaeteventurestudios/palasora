import { describe, expect, it } from "vitest";
import { resolve, browserLocale, parsePrefs } from "../../lib/i18n/context";

describe("reader context precedence (L-01..L-05, L-24)", () => {
  it("L-01 Nigeria guest: English UI, Nigeria edition; unknown country falls back safely", () => {
    const r = resolve({}, {}, "en-NG,en;q=0.9", "NG");
    expect([r.ui, r.reading, r.edition, r.sources.edition]).toEqual(["en", "en", "NG", "country"]);
    const none = resolve({}, {}, null, null);
    expect([none.ui, none.edition]).toEqual(["en", "ALL"]);
  });
  it("L-02 Senegal guest with no conflicting language gets French UI, no choice screen", () => {
    const r = resolve({}, {}, null, "SN");
    expect([r.ui, r.edition, r.sources.ui]).toEqual(["fr", "SN", "country"]);
  });
  it("L-03 Egypt guest gets Arabic RTL", () => {
    const r = resolve({}, {}, null, "EG");
    expect([r.ui, r.dir]).toEqual(["ar", "rtl"]);
  });
  it("L-04 explicit English + Nigeria edition survive a visit from Senegal", () => {
    const r = resolve({ ui: "en", reading: "en", edition: "NG" }, {}, "fr-SN,fr;q=0.9", "SN");
    expect([r.ui, r.reading, r.edition, r.sources.ui]).toEqual(["en", "en", "NG", "explicit"]);
  });
  it("L-05 French browser beats English-default country; explicit override then wins", () => {
    expect(resolve({}, {}, "fr-FR,fr;q=0.9,en;q=0.5", "NG").ui).toBe("fr");
    expect(resolve({ ui: "en" }, {}, "fr-FR,fr;q=0.9", "NG").ui).toBe("en");
  });
  it("saved account preferences beat browser and IP; explicit beats saved", () => {
    expect(resolve({}, { ui: "pcm", edition: "NG" }, "fr", "SN").ui).toBe("pcm");
    expect(resolve({ ui: "ar" }, { ui: "pcm" }, "fr", "SN").ui).toBe("ar");
  });
  it("planned locales are never enabled; a planned-locale country falls back to English with an honest default", () => {
    expect(resolve({}, {}, null, "TZ").ui).toBe("en"); // Swahili UI planned, not enabled
    expect(parsePrefs(JSON.stringify({ ui: "yo", edition: "XX" }))).toEqual({});
    expect(browserLocale("yo-NG,en;q=0.2", ["en", "fr"])).toBe("en");
  });
});

describe("translation state (L-08/L-09)", async () => {
  const { stateFor } = await import("../../lib/repo/localize");
  const loc = (status: string, v = 1) => ({ id: "x", status, source_version: v }) as never;
  it("a failed fidelity check falls back honestly and is not re-requested", () => {
    expect(stateFor(loc("failed"), "en", "fr", 1, true).status).toBe("unavailable");
  });
  it("machine output is labelled machine; blocked is never shown; stale versions re-translate", () => {
    expect(stateFor(loc("machine_unreviewed"), "en", "fr", 1, true).status).toBe("machine");
    expect(stateFor(loc("blocked"), "en", "fr", 1, true).status).toBe("unavailable");
    expect(stateFor(loc("machine_unreviewed", 1), "en", "fr", 2, true).status).toBe("pending");
    expect(stateFor(undefined, "en", "pcm", 1, false).status).toBe("unavailable");
  });
});

describe("plurals", async () => {
  const { translator } = await import("../../lib/i18n/messages");
  it("uses the singular form for n=1", () => {
    expect(translator("en")("pulse.stories", { n: 1 })).toBe("1 story");
    expect(translator("en")("pulse.stories", { n: 3 })).toBe("3 stories");
    expect(translator("fr")("pulse.humanReplies", { n: 1 })).toBe("1 réponse humaine");
  });
});
