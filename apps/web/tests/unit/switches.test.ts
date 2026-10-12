import { describe, expect, it } from "vitest";
import { SWITCHES } from "../../lib/settings";
import { SWITCH_INFO, redact, redactText, runningWord } from "../../lib/admin/switches";

describe("ISSUE-22 switch meanings and redaction", () => {
  it("every switch has a plain meaning, and negative switches read correctly", () => {
    for (const k of SWITCHES) expect(SWITCH_INFO[k].label.length).toBeGreaterThan(3);
    expect(runningWord("AUTO_PUBLISH_DISABLED", true)).toBe("Stopped");
    expect(runningWord("AUTO_PUBLISH_DISABLED", false)).toBe("Running");
    expect(runningWord("ANALYTICS_ENABLED", true)).toBe("Running");
  });
  it("redacts secrets in keys, URLs, bearer strings and long hex", () => {
    const out = JSON.stringify(redact({ reason: "ok", api_key: "abc", nested: { password_hash: "x", url: "https://p.local/auth/reset?token=abcdef123456" }, note: "Bearer eyJhbGciOi.xyz" }));
    expect(out).not.toContain("abcdef123456");
    expect(out).not.toContain("eyJhbGciOi");
    expect(out).toContain("[redacted]");
    expect(out).toContain('"reason":"ok"');
    expect(redactText("id 3f9a1c0b7d2e4f6a8b9c0d1e2f3a4b5c")).toBe("id [redacted]");
  });
});
