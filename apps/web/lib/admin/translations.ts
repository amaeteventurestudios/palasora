// ISSUE-10: rows for the Translations workspace. Pairs every translated field with its ORIGINAL text (side-by-side
// review) and derives automated flags. Flags are hints for a reviewer, never a verdict.
import { pb, q, type Rec } from "../pb";
import type { Tenant } from "../tenant";
import { pieceHref } from "@/components/StoryCard";

import { flagsFor, type FieldPair } from "./translation-flags";
export type { FieldPair };
export type TranslationRow = { id: string; headline: string; href: string; source: string; target: string; model: string; prompt: string; created: string;
  status: string; qaFails: string[]; flags: string[]; reports: number; fields: FieldPair[]; rejected: FieldPair[] };

function original(p: Rec, key: string): string {
  if (key === "headline") return String(p.headline ?? "");
  if (key === "lede") return String(p.lede ?? "");
  const m = /^(\w+)\.(\d+)$/.exec(key);
  const body = (p.body_blocks_json ?? {}) as Record<string, { text?: string }[] | string>;
  if (m && Array.isArray(body[m[1]])) return String((body[m[1]] as { text?: string }[])[Number(m[2])]?.text ?? "");
  return typeof body[key] === "string" ? String(body[key]) : "";
}
export async function translationRows(t: Tenant, limit = 1000): Promise<TranslationRow[]> {
  const locs = await pb.list("localizations", { filter: `tenant_id=${q(t.id)}`, sort: "-created", perPage: Math.min(limit, 500) });
  const ids = [...new Set(locs.map((l) => l.piece_id))];
  const pieces: Rec[] = [];
  for (let i = 0; i < ids.length; i += 60) pieces.push(...await pb.list("editorial_pieces", { filter: `tenant_id=${q(t.id)} && (${ids.slice(i, i + 60).map((x) => `id=${q(x)}`).join(" || ")})`, perPage: 100 }));
  const pm = new Map(pieces.map((p) => [p.id, p]));
  return locs.map((l) => {
    const p = (pm.get(l.piece_id) ?? { id: "", created: "", updated: "" }) as Rec;
    const pair = (o: Record<string, string>) => Object.entries(o ?? {}).map(([key, v]) => ({ key, original: original(p, key), translated: String(v ?? "") }));
    const fields = pair(l.fields as Record<string, string>);
    const rejected = l.status === "failed" ? pair((l.qa?.rejected_output ?? {}) as Record<string, string>) : [];
    const qaFails = Object.entries((l.qa?.checks ?? {}) as Record<string, string>).filter(([, v]) => v === "FAIL").map(([k]) => k);
    return { id: l.id, headline: String(p.headline ?? l.target_id ?? ""), href: p.slug ? pieceHref(p) : "", source: l.source_locale, target: l.locale, model: String(l.model ?? ""),
      prompt: String(l.prompt_version ?? ""), created: String(l.created), status: String(l.status), qaFails, flags: flagsFor(fields.length ? fields : rejected, qaFails),
      reports: Number(l.report_count ?? 0), fields, rejected };
  });
}
