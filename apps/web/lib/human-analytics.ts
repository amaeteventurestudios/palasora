// Human audience collector (docs/specs/28; W55). One row per subject per UTC day in PocketBase `human_activity`.
// Members are keyed by account id (retention needs it); guests by a daily-rotating salted hash (never linked across days).
// Excluded: automated user agents (incl. headless QA browsers), staff sessions, and guests sending GPC/DNT.
import { createHash } from "node:crypto";
import { pb, pbDate, q } from "./pb";
import type { Tenant } from "./tenant";
import type { Session } from "./session";
import { dailySaltFor, isAutomatedAgent, privacySignal } from "./engagement";

export type ActivityInput = { page: string; country: string; language: string; referrer: string };
export type ActivityResult = { counted: boolean; reason: "counted" | "updated" | "bot" | "staff" | "privacy_signal" | "invalid" };

export function deviceOf(ua: string): "mobile" | "tablet" | "desktop" | "unknown" {
  if (!ua) return "unknown";
  if (/ipad|tablet|kindle|silk/i.test(ua)) return "tablet";
  if (/mobi|android|iphone|ipod/i.test(ua)) return "mobile";
  return "desktop";
}

export function referrerCategory(ref: string, host: string): string {
  if (!ref) return "direct";
  try {
    const h = new URL(ref).hostname.toLowerCase();
    if (h === host.split(":")[0]) return "internal";
    if (/google|bing|duckduckgo|yahoo|yandex|ecosia/.test(h)) return "search";
    if (/whatsapp|wa\.me/.test(h)) return "whatsapp";
    if (/facebook|fb\.|instagram|twitter|x\.com|t\.co|linkedin|tiktok|threads|reddit|telegram|t\.me/.test(h)) return "social";
    return "referral";
  } catch { return "unknown"; }
}

export async function recordHumanActivity(t: Tenant, session: Session | null, staff: boolean, input: ActivityInput, h: Headers, net: string): Promise<ActivityResult> {
  const ua = h.get("user-agent") ?? "";
  if (isAutomatedAgent(ua)) return { counted: false, reason: "bot" };
  if (staff) return { counted: false, reason: "staff" };
  if (session && /@[^@]+\.(local|test)$/i.test(String((session.user as { email?: string }).email ?? ""))) return { counted: false, reason: "staff" }; // seeded local test accounts
  if (!session && privacySignal(h)) return { counted: false, reason: "privacy_signal" };
  const day = new Date().toISOString().slice(0, 10);
  const kind = session ? "member" : "guest";
  const key = session ? session.user.id : createHash("sha256").update([await dailySaltFor(day), day, net, ua, "human_activity"].join("|")).digest("hex").slice(0, 40);
  const existing = await pb.first("human_activity", `tenant_id=${q(t.id)} && day=${q(day)} && subject_kind=${q(kind)} && subject_key=${q(key)}`);
  if (existing) {
    await pb.update("human_activity", existing.id, { "hits+": 1, last_seen: pbDate() });
    return { counted: false, reason: "updated" };
  }
  let owner = false;
  if (session) owner = (await pb.count("agents", `tenant_id=${q(t.id)} && owner_user_id=${q(session.user.id)} && status!='draft'`)) > 0;
  try {
    await pb.create("human_activity", { tenant_id: t.id, day, subject_kind: kind, subject_key: key, country: input.country.slice(0, 3), language: input.language.slice(0, 10),
      device: deviceOf(ua), referrer: input.referrer.slice(0, 30), first_page: input.page.slice(0, 30), is_owner: owner, is_business: false, hits: 1, last_seen: pbDate() });
  } catch { return { counted: false, reason: "updated" }; } // unique-index race: another request created today's row
  return { counted: true, reason: "counted" };
}
