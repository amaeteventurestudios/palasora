// v1.7 Agent Population Manager data (server only). Counts and plans come from the editorial service (Python owns
// planning, persona synthesis and the durable runner); job rows and country groups are read straight from PocketBase.
import { env } from "../env";
import { pb, q, type Rec } from "../pb";
import type { Tenant } from "../tenant";

export type CountryStats = { cc: string; name: string; region: string; registered: number; female: number; male: number; eligible: number; resting: number;
  paused: number; held: number; retired: number; active_1h: number; active_24h: number; active_7d: number; max_ordinal: number; adm1_total: number; adm1_covered: number };
export type PopStats = { countries: Record<string, CountryStats>; totals: Record<string, number>; at: string; pending: Record<string, { n: number; female: number; male: number }> };
export type Group = { id: string; slug: string; name: string; description: string; codes: string[]; kind: "system" | "custom"; updated_by: string };
export type Job = Rec & { op: string; mode: string; status: string; phase: string; total_planned: number; done_count: number; skipped_count: number;
  duplicate_count: number; failed_count: number; per_minute: number; country_progress: Record<string, Record<string, number | string>>; errors: { at: string; message: string }[] };

/** POST/GET to the editorial service; returns {status, body} so callers can pass 409/422 explanations through. */
export async function editorial(path: string, init: RequestInit = {}, timeoutMs = 20_000): Promise<{ status: number; body: any }> {
  try {
    const r = await fetch(`${env.editorialUrl}${path}`, { ...init, cache: "no-store", signal: AbortSignal.timeout(timeoutMs),
      headers: { "x-service-token": env.editorialToken, "content-type": "application/json", ...(init.headers ?? {}) } });
    let body: any = null;
    try { body = await r.json(); } catch { body = null; }
    return { status: r.status, body };
  } catch { return { status: 503, body: { error: { code: "UNAVAILABLE", message: "Editorial service unavailable" } } }; }
}

export async function popStats(t: Tenant): Promise<PopStats | null> {
  const r = await editorial(`/population/stats?tenant_id=${encodeURIComponent(t.id)}`);
  return r.status === 200 ? (r.body as PopStats) : null;
}

export async function groups(t: Tenant): Promise<Group[]> {
  const rows = await pb.list("country_groups", { filter: `tenant_id=${q(t.id)}`, sort: "kind,name", perPage: 200 });
  return rows.map((r) => ({ id: r.id, slug: r.slug, name: r.name, description: r.description ?? "", codes: (r.codes ?? []) as string[], kind: r.kind, updated_by: r.updated_by ?? "" }));
}

export async function jobs(t: Tenant, limit = 12): Promise<Job[]> {
  return (await pb.list("population_jobs", { filter: `tenant_id=${q(t.id)}`, sort: "-created", perPage: limit,
    fields: "id,created,updated,op,mode,scope_kind,scope_label,countries,params,status,phase,total_planned,done_count,skipped_count,duplicate_count,failed_count,per_minute,country_progress,errors,actor_name,reason,started_at,finished_at,heartbeat_at,restarts,rollback_of,plan" })) as Job[];
}

export async function job(t: Tenant, id: string): Promise<Job | null> {
  const r = await pb.get("population_jobs", id);
  return r && r.tenant_id === t.id ? (r as Job) : null;
}
