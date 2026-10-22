// Append-only first-party event log, partitioned by tenant and UTC date (11-ANALYTICS).
// Payloads are allowlisted; no email, free text, IP or raw query strings are written.
import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { env } from "./env";

export const CLIENT_EVENTS = new Set(["story_viewed", "discussion_read", "share_clicked",
  "business_profile_opened", "sponsor_placement_viewed", "sponsor_clicked", "local_pulse_map_opened", "geo_area_selected", "country_trend_opened", "original_language_opened"]);
export const SERVER_EVENTS = new Set(["comment_created", "vote_cast", "signup_completed", "story_published", "correction_published",
  "inquiry_created", "ai_generation_completed", "source_fetch_failed", "interface_language_changed", "reading_language_changed", "edition_manually_changed",
  "follow_location_created", "translation_quality_reported", "country_viewed", "home_country_saved"]);

const FIELDS = ["anonymous_session_id", "member_id", "story_id", "source_id", "country_code", "topic_slug", "referrer_category",
  "utm_source", "utm_medium", "device_class", "consent_state", "channel"] as const;
const SAFE = /^[A-Za-z0-9_.:-]{0,64}$/;

export function dataRoot(): string {
  return path.isAbsolute(env.dataDir) ? env.dataDir : path.resolve(process.cwd(), env.dataDir);
}

export type EventInput = Record<string, unknown> & { event_name: string };

export function sanitizeEvent(input: EventInput, tenantId: string): Record<string, string> | null {
  const name = input.event_name;
  if (!CLIENT_EVENTS.has(name) && !SERVER_EVENTS.has(name)) return null;
  const out: Record<string, string> = {
    event_id: randomUUID(), event_name: name, occurred_at: new Date().toISOString(), tenant_id: tenantId, server_received_at: new Date().toISOString(),
  };
  for (const f of FIELDS) {
    const v = input[f];
    if (typeof v === "string" && SAFE.test(v)) out[f] = v; // anything else (emails, URLs, prose) is dropped
  }
  return out;
}

export async function writeEvent(tenantId: string, input: EventInput): Promise<boolean> {
  const ev = sanitizeEvent(input, tenantId);
  if (!ev) return false;
  if (!/^[a-z0-9]{10,20}$/.test(tenantId)) return false;
  const day = ev.occurred_at.slice(0, 10);
  const dir = path.join(dataRoot(), "analytics", `tenant=${tenantId}`, `date=${day}`);
  try {
    await mkdir(dir, { recursive: true });
    await appendFile(path.join(dir, `events-${ev.occurred_at.slice(11, 13)}.ndjson`), JSON.stringify(ev) + "\n");
    return true;
  } catch {
    return false; // analytics outage must never break a page or an action
  }
}
