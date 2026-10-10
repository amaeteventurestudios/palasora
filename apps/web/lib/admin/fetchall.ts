import { pb, type Rec } from "../pb";
/** Bounded paging helper for Command Center aggregates (hard cap keeps a dashboard from scanning unbounded history). */
export async function listAll(coll: string, filter: string, fields: string, cap = 40000, sort = ""): Promise<Rec[]> {
  const out: Rec[] = [];
  for (let page = 1; out.length < cap; page++) {
    const rows = await pb.list(coll, { filter, fields, perPage: 500, page, sort: sort || undefined });
    out.push(...rows);
    if (rows.length < 500) break;
  }
  return out;
}
export const quantile = (xs: number[], p: number) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * (s.length - 1) + 0.5))]; };
