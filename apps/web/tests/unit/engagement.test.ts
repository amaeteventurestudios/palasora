import { describe, expect, it } from "vitest";
import { engagementKey, isAutomatedAgent, privacySignal } from "../../lib/engagement";

const CHROME = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";
const ANDROID = "Mozilla/5.0 (Linux; Android 14; SM-A146P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36";

describe("engagement anti-inflation (v1.3.1)", () => {
  it("counts real browsers and refuses bots, headless browsers, link previews and scripts", () => {
    expect(isAutomatedAgent(CHROME)).toBe(false);
    expect(isAutomatedAgent(ANDROID)).toBe(false);
    for (const ua of ["Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/141.0.0.0 Safari/537.36",
      "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)", "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
      "WhatsApp/2.23.20.0 A", "curl/8.4.0", "python-httpx/0.27.0", "", "Mozilla"]) expect(isAutomatedAgent(ua), ua).toBe(true);
  });
  it("honours Global Privacy Control and Do Not Track", () => {
    expect(privacySignal(new Headers({ "sec-gpc": "1" }))).toBe(true);
    expect(privacySignal(new Headers({ dnt: "1" }))).toBe(true);
    expect(privacySignal(new Headers({}))).toBe(false);
  });
  it("dedupe key is stable within a day and unlinkable across days (salt rotates)", () => {
    const a = engagementKey("salt-day-1", "2026-10-09", "1.2.3.4", CHROME, "abcdefghij", "view");
    expect(engagementKey("salt-day-1", "2026-10-09", "1.2.3.4", CHROME, "abcdefghij", "view")).toBe(a);
    expect(engagementKey("salt-day-2", "2026-10-10", "1.2.3.4", CHROME, "abcdefghij", "view")).not.toBe(a);
    expect(engagementKey("salt-day-1", "2026-10-09", "1.2.3.4", CHROME, "abcdefghij", "share:x")).not.toBe(a);
    expect(a).toMatch(/^[a-f0-9]{64}$/); // no raw IP or UA is ever stored
  });
});
