// Apply a reader's reading language to canonical content (23 §3). One canonical ID per story;
// localizations are linked by (target, locale, source_version). Corrected originals (new revision)
// automatically invalidate older renditions. Never fabricate: missing = show original + honest label.
import { pb, q, type Rec } from "../pb";
import type { Tenant } from "../tenant";
import type { PieceSummary } from "./pieces";
import { localeInfo } from "../i18n/context";
import { editorialFetch } from "../editorial-client";

export type TranslationState = { status: "original" | "machine" | "reviewed" | "pending" | "unavailable"; from: string; to: string; localization_id?: string };

const requested = new Map<string, number>();
function requestOnce(t: Tenant, type: "piece" | "comment", id: string, locale: string, version: number) {
  const key = `${t.id}:${type}:${id}:${locale}:${version}`;
  if ((requested.get(key) ?? 0) > Date.now() - 10 * 60_000) return;
  requested.set(key, Date.now());
  void editorialFetch("/translations/request", { method: "POST", body: JSON.stringify({ tenant_id: t.id, target_type: type, target_id: id, locale, version }) }, 2000);
}

export async function localizationsFor(t: Tenant, type: "piece" | "comment", ids: string[], locale: string): Promise<Map<string, Rec>> {
  const m = new Map<string, Rec>();
  if (!ids.length) return m;
  for (let i = 0; i < ids.length; i += 40) {
    const chunk = ids.slice(i, i + 40);
    const rows = await pb.list("localizations", { filter: `tenant_id=${q(t.id)} && target_type=${q(type)} && locale=${q(locale)} && (status='machine_unreviewed' || status='reviewed' || status='blocked' || status='failed') && (${chunk.map((x) => `target_id=${q(x)}`).join(" || ")})`, sort: "-source_version", perPage: 200 });
    // Newest source version first; within a version an editor's block wins, then reviewed, machine, failed.
    const order: Record<string, number> = { blocked: 3, reviewed: 2, machine_unreviewed: 1, failed: 0 };
    const rank = (r: Rec) => r.source_version * 10 + (order[r.status] ?? 0);
    for (const r of rows) { const cur = m.get(r.target_id); if (!cur || rank(r) > rank(cur)) m.set(r.target_id, r); }
  }
  return m;
}

export function stateFor(loc: Rec | undefined, sourceLocale: string, reading: string, currentVersion: number, mtEnabled: boolean): TranslationState {
  if (reading === sourceLocale) return { status: "original", from: sourceLocale, to: reading };
  // A translation that failed the fidelity gate is never shown and not retried in a loop: honest fallback to the original.
  // Blocked by an editor, or failed the fidelity gate: never shown, not re-requested; honest fallback to the original.
  if (loc && (loc.status === "failed" || loc.status === "blocked") && loc.source_version === currentVersion) return { status: "unavailable", from: sourceLocale, to: reading };
  if (loc && loc.status !== "blocked" && loc.status !== "failed" && loc.source_version === currentVersion) return { status: loc.status === "reviewed" ? "reviewed" : "machine", from: sourceLocale, to: reading, localization_id: loc.id };
  return { status: mtEnabled ? "pending" : "unavailable", from: sourceLocale, to: reading };
}

export async function localizeSummaries(t: Tenant, items: PieceSummary[], reading: string, revisions: Map<string, number> = new Map()): Promise<(PieceSummary & { translation: TranslationState })[]> {
  const mt = localeInfo(reading)?.mt === "enabled";
  const locs = reading === "en" ? new Map() : await localizationsFor(t, "piece", items.map((p) => p.id), reading);
  return items.map((p) => {
    const src = p.original_language || "en";
    const ver = revisions.get(p.id) ?? (p as unknown as { revision?: number }).revision ?? 1;
    const loc = locs.get(p.id);
    const st = stateFor(loc, src, reading, ver, mt);
    if (st.status === "pending") requestOnce(t, "piece", p.id, reading, ver);
    if (st.status === "machine" || st.status === "reviewed") {
      const f = loc!.fields ?? {};
      return { ...p, headline: f.headline || p.headline, lede: f.lede || p.lede, translation: st };
    }
    return { ...p, translation: st };
  });
}

/** Full piece: headline, lede and body blocks swapped only when a current-version translation exists. */
export async function localizePiece(t: Tenant, piece: Rec, reading: string): Promise<{ piece: Rec; translation: TranslationState }> {
  const src = piece.original_language || "en";
  const mt = localeInfo(reading)?.mt === "enabled";
  if (reading === src) return { piece, translation: { status: "original", from: src, to: reading } };
  const loc = (await localizationsFor(t, "piece", [piece.id], reading)).get(piece.id);
  const st = stateFor(loc, src, reading, piece.revision ?? 1, mt);
  if (st.status === "pending") requestOnce(t, "piece", piece.id, reading, piece.revision ?? 1);
  if (st.status !== "machine" && st.status !== "reviewed") return { piece, translation: st };
  const f = loc!.fields ?? {};
  const body = { ...(piece.body_blocks_json ?? {}) };
  for (const k of ["what_happened", "why_it_matters"]) {
    body[k] = (body[k] ?? []).map((b: { text: string; claim_ids?: string[] }, i: number) => ({ ...b, text: f[`${k}.${i}`] || b.text }));
  }
  return { piece: { ...piece, headline: f.headline || piece.headline, lede: f.lede || piece.lede, body_blocks_json: body }, translation: st };
}
