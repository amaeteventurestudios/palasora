// Real human engagement for trending (v1.3.1; 23 §5, A-09). Aggregate per-story daily counters only.
//
// Privacy: no cookie and no stored identifier. A visitor is deduplicated per story per day with
// sha256(daily-rotating random salt | day | network key | user agent | story | event). The salt is
// regenerated each UTC day, so the same visitor cannot be linked across days. Raw IPs and user
// agents are never written, and the hash rows are purged after 48 h. GPC/DNT is honoured: nothing is counted.
//
// Anti-inflation: bots, crawlers, link-preview fetchers and headless browsers are not counted. Staff sessions
// (editors and moderators reviewing content) are not counted. Requests must be same-origin, and per-client rate
// limits apply. A view counts only after the page was visible for 5 s (client beacon). AI agents never call this.
import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pb, q } from "./pb";
import { dataRoot } from "./analytics-server";
import type { Tenant } from "./tenant";

export const SHARE_CHANNELS = ["whatsapp", "x", "facebook", "copy", "native"] as const;
export type EngagementKind = "view" | "share";
export type EngagementResult = { counted: boolean; reason: "counted" | "bot" | "duplicate" | "staff" | "privacy_signal" | "not_found" | "invalid" };

const BOT_UA = /bot|crawl|spider|slurp|scrap|headless|phantom|puppeteer|playwright|selenium|lighthouse|pagespeed|preview|facebookexternalhit|whatsapp\/|telegrambot|discordbot|slackbot|embedly|curl|wget|python|httpx|axios|node-fetch|go-http|java\/|okhttp|postman|insomnia|monitor|uptime|^$/i;

export function isAutomatedAgent(ua: string | null): boolean {
  const s = (ua ?? "").trim();
  if (s.length < 20) return true; // real browsers send a full UA string
  return BOT_UA.test(s);
}

export function privacySignal(h: Headers): boolean {
  return h.get("sec-gpc") === "1" || h.get("dnt") === "1";
}

const saltCache: { day: string; salt: string } = { day: "", salt: "" };
async function dailySalt(day: string): Promise<string> {
  if (saltCache.day === day) return saltCache.salt;
  const dir = path.join(dataRoot(), "run");
  const file = path.join(dir, `engagement-salt-${day}`);
  let salt = "";
  try { salt = (await readFile(file, "utf8")).trim(); } catch { /* new day */ }
  if (!/^[a-f0-9]{64}$/.test(salt)) {
    salt = randomBytes(32).toString("hex");
    try { await mkdir(dir, { recursive: true }); await writeFile(file, salt, { mode: 0o600, flag: "wx" }); } catch {
      try { salt = (await readFile(file, "utf8")).trim(); } catch { /* keep the in-memory salt */ }
    }
  }
  saltCache.day = day; saltCache.salt = salt;
  return salt;
}

export function engagementKey(salt: string, day: string, net: string, ua: string, pieceId: string, event: string): string {
  return createHash("sha256").update([salt, day, net, ua, pieceId, event].join("|")).digest("hex");
}

async function bump(t: Tenant, pieceId: string, day: string, fields: Record<string, number>) {
  const row = await pb.first("engagement_daily", `tenant_id=${q(t.id)} && piece_id=${q(pieceId)} && day=${q(day)}`);
  const inc = Object.fromEntries(Object.entries(fields).map(([k, v]) => [`${k}+`, v])); // atomic increments in PocketBase
  if (row) { await pb.update("engagement_daily", row.id, inc); return; }
  try {
    await pb.create("engagement_daily", { tenant_id: t.id, piece_id: pieceId, day, views: 0, shares: 0, share_whatsapp: 0, share_x: 0, share_facebook: 0, share_copy: 0,
      share_native: 0, rejected_bot: 0, rejected_duplicate: 0, ...fields });
  } catch { // created concurrently: fall back to an increment
    const again = await pb.first("engagement_daily", `tenant_id=${q(t.id)} && piece_id=${q(pieceId)} && day=${q(day)}`);
    if (again) await pb.update("engagement_daily", again.id, inc);
  }
}

let lastPurge = 0;
async function purgeOldKeys() {
  if (Date.now() - lastPurge < 3600_000) return;
  lastPurge = Date.now();
  const cutoff = new Date(Date.now() - 2 * 86400_000).toISOString().slice(0, 10);
  for (const k of await pb.list("engagement_keys", { filter: `day < ${q(cutoff)}`, perPage: 500, fields: "id" })) await pb.remove("engagement_keys", k.id).catch(() => undefined);
}

export async function recordEngagement(t: Tenant, pieceId: string, kind: EngagementKind, channel: string, h: Headers, net: string, isStaffSession: boolean): Promise<EngagementResult> {
  if (!/^[a-z0-9]{10,20}$/.test(pieceId)) return { counted: false, reason: "invalid" };
  if (kind === "share" && !(SHARE_CHANNELS as readonly string[]).includes(channel)) return { counted: false, reason: "invalid" };
  const piece = await pb.first("editorial_pieces", `tenant_id=${q(t.id)} && id=${q(pieceId)} && review_status='published'`);
  if (!piece) return { counted: false, reason: "not_found" };
  const day = new Date().toISOString().slice(0, 10);
  if (privacySignal(h)) return { counted: false, reason: "privacy_signal" };
  if (isStaffSession) return { counted: false, reason: "staff" };
  const ua = h.get("user-agent");
  if (isAutomatedAgent(ua)) { await bump(t, pieceId, day, { rejected_bot: 1 }); return { counted: false, reason: "bot" }; }
  const salt = await dailySalt(day);
  const key = engagementKey(salt, day, net, ua ?? "", pieceId, kind === "view" ? "view" : `share:${channel}`);
  try {
    await pb.create("engagement_keys", { tenant_id: t.id, key_hash: key, day });
  } catch {
    await bump(t, pieceId, day, { rejected_duplicate: 1 });
    return { counted: false, reason: "duplicate" };
  }
  await bump(t, pieceId, day, kind === "view" ? { views: 1 } : { shares: 1, [`share_${channel}`]: 1 });
  void purgeOldKeys().catch(() => undefined);
  return { counted: true, reason: "counted" };
}

/** Human views/shares per story within [sinceDay, today]. */
export async function engagementSince(t: Tenant, pieceIds: string[], sinceDay: string): Promise<Map<string, { views: number; shares: number }>> {
  const m = new Map<string, { views: number; shares: number }>();
  if (!pieceIds.length) return m;
  for (let i = 0; i < pieceIds.length; i += 40) {
    const chunk = pieceIds.slice(i, i + 40);
    const rows = await pb.list("engagement_daily", { filter: `tenant_id=${q(t.id)} && day >= ${q(sinceDay)} && (${chunk.map((x) => `piece_id=${q(x)}`).join(" || ")})`, perPage: 500 });
    for (const r of rows) {
      const cur = m.get(r.piece_id) ?? { views: 0, shares: 0 };
      m.set(r.piece_id, { views: cur.views + (r.views ?? 0), shares: cur.shares + (r.shares ?? 0) });
    }
  }
  return m;
}
