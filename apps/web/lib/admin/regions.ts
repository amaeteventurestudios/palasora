// ISSUE-03: founder-configured regional participation priority. Mirrors services/editorial/palavva_editorial/city/regions.py
// (same tenant_settings key and defaults; a unit test checks the two default lists match). A weight only changes how often
// ELIGIBLE residents affiliated with a region are picked for reply and original-post slots; it is not measured demand.
import { pb, q } from "../pb";
import type { Tenant } from "../tenant";

export const KEY = "REGION_PRIORITY";
export const NIGERIA_PRIORITY = ["NG-LA", "NG-OG", "NG-OY", "NG-OS", "NG-ON", "NG-EK", "NG-AN", "NG-EN", "NG-IM", "NG-AB", "NG-EB", "NG-RI", "NG-AK", "NG-CR",
  "NG-DE", "NG-ED", "NG-BY", "NG-FC", "NG-KN", "NG-KD"];
export const DEFAULTS: Record<string, number> = Object.fromEntries(NIGERIA_PRIORITY.map((c) => [c, 2]));
export const clampWeight = (v: unknown) => Math.max(0, Math.min(3, Math.round(Number(v) * 4) / 4 || 0));

export async function regionWeights(t: Tenant): Promise<{ weights: Record<string, number>; stored: Record<string, number>; revision: number; id: string | null }> {
  const r = await pb.first("tenant_settings", `tenant_id=${q(t.id)} && key=${q(KEY)}`);
  const stored = (r?.value?.weights ?? {}) as Record<string, number>;
  return { weights: { ...DEFAULTS, ...stored }, stored, revision: Number(r?.value?.revision ?? 0), id: r?.id ?? null };
}
