// Novenique sign-in (Phase 1 of the shared platform): "Continue with Novenique" sends people to the shared accounts site
// (accounts.novenique.com) and back with a one-time code, which this server swaps for the person's id (authorization code
// + PKCE). The person is the same row in `users` that Palasora already reads (the accounts site writes to this
// PocketBase), so Palasora's own sessions, memberships, roles, MFA and Sora account all carry on as before.
//
// Off unless NOVENIQUE_SIGNIN=on and the three values below are set (the server's install puts the last three in
// /etc/palasora-novenique.env). The password forms stay for one release, as the platform plan says.
//   NOVENIQUE_SIGNIN=on   NOVENIQUE_URL=https://accounts.novenique.com   NOVENIQUE_CLIENT_ID=palasora   NOVENIQUE_CLIENT_SECRET=...
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export type NvConfig = { on: boolean; url: string; clientId: string; secret: string };
export type NvUser = { id: string; display_name: string; handle: string; kind: string; email_verified: boolean };
export type NvExchange = { ok: true; user: NvUser; roles: { product: string; role: string }[]; mergedFrom: string[] } | { ok: false; reason: string };

export const NV_COOKIE = "pv_nv";
export const CALLBACK_PATH = "/auth/novenique/callback";

export function noveniqueConfig(e: Record<string, string | undefined> = process.env): NvConfig {
  const url = (e.NOVENIQUE_URL ?? "").replace(/\/$/, ""), clientId = e.NOVENIQUE_CLIENT_ID ?? "", secret = e.NOVENIQUE_CLIENT_SECRET ?? "";
  const on = ["1", "true", "yes", "on"].includes(String(e.NOVENIQUE_SIGNIN ?? "").toLowerCase()) && /^https?:\/\//.test(url) && !!clientId && !!secret;
  return { on, url, clientId, secret };
}

export const callbackUrl = (host: string, proto: string) => `${proto === "https" ? "https" : "http"}://${host}${CALLBACK_PATH}`;
const challengeOf = (verifier: string) => createHash("sha256").update(verifier).digest("base64url");

/** Where to send the browser, and what to remember (in a short-lived httpOnly cookie) until it comes back. */
export function startSignIn(cfg: NvConfig, host: string, proto: string, next: string): { location: string; cookie: string } {
  const verifier = randomBytes(48).toString("base64url"), state = randomBytes(16).toString("base64url");
  const p = new URLSearchParams({ response_type: "code", client_id: cfg.clientId, redirect_uri: callbackUrl(host, proto), state,
    code_challenge: challengeOf(verifier), code_challenge_method: "S256" });
  return { location: `${cfg.url}/authorize?${p}`, cookie: Buffer.from(JSON.stringify({ v: verifier, s: state, n: next, h: host })).toString("base64url") };
}

export function readStart(cookie: string | undefined, state: string | null, host: string): { verifier: string; next: string } | null {
  if (!cookie || !state || cookie.length > 2000) return null;
  try {
    const c = JSON.parse(Buffer.from(cookie, "base64url").toString());
    const a = Buffer.from(String(c.s)), b = Buffer.from(state);
    if (a.length !== b.length || !timingSafeEqual(a, b) || c.h !== host || typeof c.v !== "string") return null;
    return { verifier: c.v, next: typeof c.n === "string" ? c.n : "/" };
  } catch { return null; }
}

/** Server to server: the one-time code and the PKCE verifier for the person's id. */
export async function exchangeCode(cfg: NvConfig, o: { code: string; verifier: string; redirectUri: string }, fetchImpl: typeof fetch = fetch): Promise<NvExchange> {
  let r: Response;
  try {
    r = await fetchImpl(`${cfg.url}/token`, {
      method: "POST", cache: "no-store", signal: AbortSignal.timeout(10_000),
      headers: { "content-type": "application/x-www-form-urlencoded", authorization: "Basic " + Buffer.from(`${encodeURIComponent(cfg.clientId)}:${encodeURIComponent(cfg.secret)}`).toString("base64") },
      body: new URLSearchParams({ grant_type: "authorization_code", code: o.code, redirect_uri: o.redirectUri, code_verifier: o.verifier }),
    });
  } catch { return { ok: false, reason: "unreachable" }; }
  if (!r.ok) return { ok: false, reason: r.status === 401 ? "client" : "grant" };
  const j = await r.json().catch(() => null);
  if (!j?.user || typeof j.user.id !== "string" || !/^[a-z0-9]{15}$/.test(j.user.id)) return { ok: false, reason: "grant" };
  return { ok: true, user: j.user, roles: Array.isArray(j.roles) ? j.roles : [], mergedFrom: Array.isArray(j.merged_from) ? j.merged_from : [] };
}
