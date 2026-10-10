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

export type SourceHealth = { id: string; name: string; countries: string[]; enabled: boolean; rights: string; state: "healthy" | "stale" | "failing" | "never" | "off"; lastOk: string; failures: number; error: string };
export async function sourceHealth(t: Tenant): Promise<SourceHealth[]> {
  const rows = await pb.list("sources", { filter: `tenant_id=${q(t.id)}`, perPage: 300, fields: "id,publisher_name,countries,enabled,rights_status,last_success_at,consecutive_failures,last_error_code,fetch_interval_minutes" });
  return rows.map((s) => {
    const age = s.last_success_at ? Date.now() - new Date(String(s.last_success_at).replace(" ", "T")).getTime() : Infinity;
    const state = !s.enabled || s.rights_status !== "approved" ? "off" : s.consecutive_failures > 0 ? "failing" : !s.last_success_at ? "never" : age > 3 * (s.fetch_interval_minutes || 60) * 60_000 ? "stale" : "healthy";
    return { id: s.id, name: s.publisher_name, countries: s.countries ?? [], enabled: !!s.enabled, rights: s.rights_status, state, lastOk: s.last_success_at ?? "", failures: s.consecutive_failures ?? 0, error: s.last_error_code ?? "" };
  });
}

export type Services = { pocketbase: boolean; editorial: boolean; economy: boolean; model: { reachable: boolean; latency_ms?: number } | null; queue: Record<string, number> | null };
export async function services(): Promise<Services> {
  const [st, econ] = await Promise.all([
    editorialFetch<{ provider: { reachable: boolean; latency_ms?: number }; queue: Record<string, number>; pocketbase: boolean }>("/status", {}, 4000),
    editorialFetch<{ markets_configured: number }>("/economy/summary?market=ALL", {}, 3000),
  ]);
  return { pocketbase: await pb.health(), editorial: !!st, economy: !!econ, model: st?.provider ?? null, queue: st?.queue ?? null };
}
