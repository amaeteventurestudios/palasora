import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { CALLBACK_PATH, exchangeCode, noveniqueConfig, readStart, startSignIn } from "../../lib/novenique";

const cfg = noveniqueConfig({ NOVENIQUE_SIGNIN: "on", NOVENIQUE_URL: "https://accounts.example/", NOVENIQUE_CLIENT_ID: "palasora", NOVENIQUE_CLIENT_SECRET: "s3cret" });

describe("Novenique sign-in (shared platform Phase 1)", () => {
  it("is off unless switched on with every value set", () => {
    expect(noveniqueConfig({}).on).toBe(false);
    expect(noveniqueConfig({ NOVENIQUE_SIGNIN: "on", NOVENIQUE_URL: "https://a", NOVENIQUE_CLIENT_ID: "palasora" }).on).toBe(false);
    expect(noveniqueConfig({ NOVENIQUE_SIGNIN: "off", NOVENIQUE_URL: "https://a", NOVENIQUE_CLIENT_ID: "p", NOVENIQUE_CLIENT_SECRET: "s" }).on).toBe(false);
    expect(cfg.on).toBe(true);
    expect(cfg.url).toBe("https://accounts.example");
  });

  it("starts with PKCE (S256) and a state only this browser and host can answer", () => {
    const s = startSignIn(cfg, "palasora.com", "https", "/feed");
    const u = new URL(s.location);
    expect(u.origin + u.pathname).toBe("https://accounts.example/authorize");
    expect(u.searchParams.get("redirect_uri")).toBe(`https://palasora.com${CALLBACK_PATH}`);
    expect(u.searchParams.get("code_challenge_method")).toBe("S256");
    const c = JSON.parse(Buffer.from(s.cookie, "base64url").toString());
    expect(u.searchParams.get("code_challenge")).toBe(createHash("sha256").update(c.v).digest("base64url"));
    const state = u.searchParams.get("state")!;
    expect(readStart(s.cookie, state, "palasora.com")).toEqual({ verifier: c.v, next: "/feed" });
    expect(readStart(s.cookie, state + "x", "palasora.com")).toBeNull();
    expect(readStart(s.cookie, state, "www.palasora.com")).toBeNull();
    expect(readStart(undefined, state, "palasora.com")).toBeNull();
    expect(readStart("garbage", state, "palasora.com")).toBeNull();
  });

  it("swaps the code server to server with the client secret, and refuses anything odd", async () => {
    let seen: { url: string; auth: string; body: string } | null = null;
    const ok = (async (url: string, init: RequestInit) => {
      seen = { url, auth: String((init.headers as Record<string, string>).authorization), body: String(init.body) };
      return new Response(JSON.stringify({ user: { id: "abcdefghijklmno", display_name: "Ada", handle: "ada", kind: "member", email_verified: true }, roles: [], merged_from: ["zyxwvutsrqponml"] }));
    }) as unknown as typeof fetch;
    const x = await exchangeCode(cfg, { code: "c0de", verifier: "v", redirectUri: "https://palasora.com/auth/novenique/callback" }, ok);
    expect(x).toMatchObject({ ok: true, user: { id: "abcdefghijklmno" }, mergedFrom: ["zyxwvutsrqponml"] });
    expect(seen!.url).toBe("https://accounts.example/token");
    expect(seen!.auth).toBe("Basic " + Buffer.from("palasora:s3cret").toString("base64"));
    expect(new URLSearchParams(seen!.body).get("code_verifier")).toBe("v");
    const status = (n: number) => (async () => new Response("{}", { status: n })) as unknown as typeof fetch;
    expect(await exchangeCode(cfg, { code: "c", verifier: "v", redirectUri: "r" }, status(400))).toEqual({ ok: false, reason: "grant" });
    expect(await exchangeCode(cfg, { code: "c", verifier: "v", redirectUri: "r" }, status(401))).toEqual({ ok: false, reason: "client" });
    const odd = (async () => new Response(JSON.stringify({ user: { id: "../../x" } }))) as unknown as typeof fetch;
    expect((await exchangeCode(cfg, { code: "c", verifier: "v", redirectUri: "r" }, odd)).ok).toBe(false);
    const down = (async () => { throw new Error("down"); }) as unknown as typeof fetch;
    expect(await exchangeCode(cfg, { code: "c", verifier: "v", redirectUri: "r" }, down)).toEqual({ ok: false, reason: "unreachable" });
  });
});
