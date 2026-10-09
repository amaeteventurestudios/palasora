import { readdir, stat, statfs } from "node:fs/promises";
import path from "node:path";
import { dataRoot } from "./analytics-server";
import { editorialFetch } from "./editorial-client";

export async function backupStatus(): Promise<{ latest: string | null; ageHours: number | null; count: number; restoreDrill: string | null }> {
  const dir = path.resolve(dataRoot(), "..", "backups");
  try {
    const files = (await readdir(dir)).filter((f) => f.startsWith("palavva-") && f.endsWith(".tar.gz"));
    if (!files.length) return { latest: null, ageHours: null, count: 0, restoreDrill: null };
    const stats = await Promise.all(files.map(async (f) => ({ f, m: (await stat(path.join(dir, f))).mtime })));
    stats.sort((a, b) => b.m.getTime() - a.m.getTime());
    let drill: string | null = null;
    try { drill = (await stat(path.join(dir, "LAST_RESTORE_DRILL_OK"))).mtime.toISOString(); } catch { /* none */ }
    return { latest: stats[0].f, ageHours: (Date.now() - stats[0].m.getTime()) / 3600_000, count: files.length, restoreDrill: drill };
  } catch { return { latest: null, ageHours: null, count: 0, restoreDrill: null }; }
}

export async function diskFree(): Promise<{ freeGb: number; totalGb: number } | null> {
  try { const s = await statfs(dataRoot()); return { freeGb: (s.bavail * s.bsize) / 1e9, totalGb: (s.blocks * s.bsize) / 1e9 }; } catch { return null; }
}

export type EditorialStatus = {
  queue: { by_state: Record<string, number>; by_type: Record<string, number>; oldest_queued_age_s: number | null; dead_letters: { job_id: string; type: string; error: string; created_at: number }[];
    recent: { job_id: string; type: string; state: string; attempts: number; error_class: string | null; updated_at: number }[] };
  provider: { provider: string; model: string; reachable: boolean; model_present?: boolean; latency_ms?: number; error?: string; checked_at?: number };
  budget_used_today: number | null; budget_limit: number; max_concurrency: number; timeout_sec: number;
  flags: Record<string, boolean>; cloud_providers: Record<string, string>; pocketbase: boolean;
};

export function editorialStatus(tenantId: string) {
  return editorialFetch<EditorialStatus>(`/status?tenant_id=${tenantId}`, {}, 8000);
}
