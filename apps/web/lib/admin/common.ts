// Shared Command Center reads used by several workspaces.
import { pb, q } from "../pb";
import type { Tenant } from "../tenant";
import { editorialFetch } from "../editorial-client";
import { listAll } from "./fetchall";
import { countryCodes } from "../edition";

/** Published, non-demo items per subject country (a multi-country item counts for each country). */
export async function coverageByCountry(t: Tenant, sinceTs?: string): Promise<Record<string, number>> {
  let f = `tenant_id=${q(t.id)} && review_status='published' && is_demo=false`;
  if (sinceTs) f += ` && published_at >= ${q(sinceTs)}`;
  const rows = await listAll("editorial_pieces", f, "country_codes", 20000);
  const out: Record<string, number> = Object.fromEntries(countryCodes().map((c) => [c, 0]));
  for (const r of rows) for (const c of (r.country_codes ?? []) as string[]) if (c in out) out[c]++;
  return out;
}

export type Services = { pocketbase: boolean; editorial: boolean; economy: boolean; model: { reachable: boolean; latency_ms?: number } | null; queue: QueueStatus | null };
/** Editorial /status queue shape (nested; v1.7 typed it flat, which printed [object Object]). */
export type QueueStatus = { by_state?: Record<string, number>; by_type?: Record<string, number>; oldest_queued_age_s?: number | null; dead_letters?: unknown[]; recent?: unknown[] };
export async function services(): Promise<Services> {
  const [st, econ] = await Promise.all([
    editorialFetch<{ provider: { reachable: boolean; latency_ms?: number }; queue: QueueStatus; pocketbase: boolean }>("/status", {}, 4000),
    editorialFetch<{ markets_configured: number }>("/economy/summary?market=ALL", {}, 3000),
  ]);
  return { pocketbase: await pb.health(), editorial: !!st, economy: !!econ, model: st?.provider ?? null, queue: st?.queue ?? null };
}
