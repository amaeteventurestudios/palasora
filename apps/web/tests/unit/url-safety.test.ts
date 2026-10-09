import { describe, expect, it } from "vitest";
import { safeExternalUrl } from "../../lib/url-safety";

describe("T-032 malicious business URLs are blocked", () => {
  it("allows ordinary public websites", () => {
    expect(safeExternalUrl("https://example.co.ke/menu")).toBe("https://example.co.ke/menu");
    expect(safeExternalUrl("http://shop.example.ng")).toBe("http://shop.example.ng/");
  });
  it.each([
    "javascript:alert(1)", "JaVaScRiPt:alert(1)", "data:text/html,<script>alert(1)</script>", "vbscript:msgbox(1)", "file:///etc/passwd", "ftp://example.com",
    "https://bank.example@evil.example/login", "https://user:pass@example.com", "http://localhost:3000/admin", "http://127.0.0.1/", "http://10.0.0.5/",
    "http://192.168.1.1/", "http://169.254.169.254/latest/meta-data/", "http://100.70.149.32:11434/", "http://[::1]/", "http://2130706433/", "http://0x7f000001/",
    "https://intranet.corp/", "https://printer.local/", "https://example.com/\u0000x", "https://exa mple.com", "https://example.com/\"onmouseover=alert(1)", "",
  ])("blocks %s", (u) => {
    expect(safeExternalUrl(u)).toBeNull();
  });
});
