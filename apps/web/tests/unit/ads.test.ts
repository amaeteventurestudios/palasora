import { describe, expect, it } from "vitest";
import { PLACEMENTS, matches, parseReviveAjs, slotsFor } from "../../lib/ads/inventory";

const ctx = { edition: "NG", language: "en", device: "mobile" as const, subpal: "afrobeats", topics: ["music"] };
const H = "ads.example.test";
// Modelled on Revive Adserver 6 ajs.php output (string-concatenated HTML + document.write); must be re-checked against the live server.
const ajs = (inner: string) => `var OX_8f1c2a = '';\nOX_8f1c2a += ${inner};\ndocument.write(OX_8f1c2a);\n`;
const banner = ajs(`"<"+"a href=\\'http://${H}/www/delivery/ck.php?oaparams=2__bannerid=7__zoneid=3__cb=abc__oadest=https%3A%2F%2Fsponsor.example%2F\\' target=\\'_blank\\'><"+"img src=\\'https://${H}/www/images/x.png\\' width=\\'300\\' height=\\'250\\' alt=\\'Sponsor\\' border=\\'0\\' /><"+"/a><"+"div id=\\'beacon_abc\\' style=\\'position: absolute; visibility: hidden;\\'><"+"img src=\\'http://${H}/www/delivery/lg.php?bannerid=7&amp;campaignid=2&amp;zoneid=3&amp;cb=abc\\' width=\\'0\\' height=\\'0\\' alt=\\'\\' /><"+"/div>\\n"`);

describe("ISSUE-16 targeting hierarchy", () => {
  it("All Africa when empty; country, region, language, SubPal, topic and device narrow it", () => {
    expect(matches(null, ctx)).toBe(true);
    expect(matches({ countries: ["NG"] }, ctx)).toBe(true);
    expect(matches({ countries: ["KE"] }, ctx)).toBe(false);
    expect(matches({ regions: ["West Africa"] }, ctx)).toBe(true);
    expect(matches({ regions: ["East Africa"] }, ctx)).toBe(false);
    expect(matches({ regions: ["West Africa"] }, { ...ctx, edition: "ALL" })).toBe(false); // All-Africa edition has no single region
    expect(matches({ languages: ["fr"] }, ctx)).toBe(false);
    expect(matches({ subpals: ["afrobeats"], topics: ["music"], devices: ["mobile"] }, ctx)).toBe(true);
    expect(matches({ devices: ["desktop"] }, ctx)).toBe(false);
    expect(matches({ adminRegions: ["NG-LA"] }, ctx)).toBe(false); // reader admin region unknown → never assumed
  });
});
describe("ISSUE-16 density", () => {
  it("feed: first card after the 6th post, then every 12, at most 3 per page", () => {
    const f = PLACEMENTS.find((p) => p.key === "feed_inline")!;
    expect(slotsFor(f, 5)).toEqual([]); expect(slotsFor(f, 6)).toEqual([5]); expect(slotsFor(f, 30)).toEqual([5, 17, 29]); expect(slotsFor(f, 100)).toHaveLength(3);
    expect(slotsFor(PLACEMENTS.find((p) => p.key === "thread_long")!, 40)).toEqual([14, 29]);
  });
});
describe("ISSUE-16 Revive delivery parsing (fixture)", () => {
  it("keeps only a Revive-host click link, an https image and the Revive beacon", () => {
    const c = parseReviveAjs(banner, H)!;
    expect(c.clickUrl).toContain(`http://${H}/www/delivery/ck.php`); expect(c.imageUrl).toBe(`https://${H}/www/images/x.png`);
    expect(c.beaconUrl).toContain("lg.php?bannerid=7&campaignid=2"); expect(c.width).toBe(300); expect(c.bannerId).toBe("7");
  });
  it("refuses scripts, iframes, foreign hosts and empty zones", () => {
    expect(parseReviveAjs(ajs(`"<"+"script>alert(1)<"+"/script>"`), H)).toBeNull();
    expect(parseReviveAjs(ajs(`"<"+"iframe src=\\'https://${H}/x\\'><"+"/iframe>"`), H)).toBeNull();
    expect(parseReviveAjs(banner.replaceAll(H, "evil.example"), H)).toBeNull();
    expect(parseReviveAjs("var OX_1 = '';\ndocument.write(OX_1);", H)).toBeNull();
  });
});
