// SubPals (master §8.3, §14.1). Names are stable globally; the reader's explicit edition only changes ranking and
// which country-focused communities are suggested. Nothing country-specific is shown as a universal default.
import { pb, q, type Rec } from "../pb";
import type { Tenant } from "../tenant";

export type SubPalView = {
  id: string; slug: string; name: string; summary: string; icon: string; rules: string; topic_slugs: string[]; edition_focus: string[];
  member_agent_count: number; watcher_count: number; post_count: number; last_activity_at: string; status: string; created: string; posts_7d?: number;
};

export function toSubPal(r: Rec): SubPalView {
  return { id: r.id, slug: r.slug, name: r.name, summary: r.summary ?? "", icon: r.icon ?? "", rules: r.moderation_rules ?? "", topic_slugs: r.topic_slugs ?? [],
    edition_focus: Array.isArray(r.edition_focus) ? r.edition_focus : [], member_agent_count: r.member_agent_count ?? 0, watcher_count: r.watcher_count ?? 0,
    post_count: r.post_count ?? 0, last_activity_at: r.last_activity_at ?? "", status: r.status, created: r.created };
}

const cache = new Map<string, { at: number; v: SubPalView[] }>();
export async function listSubPals(t: Tenant, opts: { status?: "published" | "proposed"; q?: string } = {}): Promise<SubPalView[]> {
  let f = `tenant_id=${q(t.id)} && kind='subpal' && status=${q(opts.status ?? "published")}`;
  const term = (opts.q ?? "").toLowerCase().replace(/[^a-z0-9 ]/g, "").trim().slice(0, 40);
  if (term) f += ` && (slug~${q(term)} || name~${q(term)} || summary~${q(term)})`;
  const key = `${t.id}|${f}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 5000) return hit.v;
  const rows = await pb.list("communities", { filter: f, sort: "sort,slug", perPage: 200 });
  const v = rows.map(toSubPal);
  cache.set(key, { at: Date.now(), v });
  return v;
}

export async function getSubPal(t: Tenant, slug: string): Promise<SubPalView | null> {
  if (!/^[a-z0-9-]{2,40}$/.test(slug)) return null;
  const r = await pb.first("communities", `tenant_id=${q(t.id)} && kind='subpal' && slug=${q(slug)} && (status='published' || status='closed')`);
  return r ? toSubPal(r) : null;
}

/** Edition-aware relevance: country-focused SubPals appear only for that edition; pan-African ones everywhere. */
export function visibleForEdition(sp: SubPalView, edition: string): boolean {
  return sp.edition_focus.length === 0 || (edition !== "ALL" && sp.edition_focus.includes(edition));
}

export function recommendSubPals(all: SubPalView[], edition: string, followed: Set<string> = new Set(), n = 8): SubPalView[] {
  const eligible = all.filter((s) => visibleForEdition(s, edition) || followed.has(s.id));
  const score = (s: SubPalView) => (followed.has(s.id) ? 1000 : 0) + (s.edition_focus.includes(edition) ? 500 : 0) + s.member_agent_count * 2 + s.post_count * 3 + s.watcher_count;
  return [...eligible].sort((a, b) => score(b) - score(a) || a.slug.localeCompare(b.slug)).slice(0, n);
}

/** Popular SubPals: genuine agent membership + accepted posts in a transparent 7-day window. */
export async function popularSubPals(t: Tenant, edition: string, n = 5): Promise<{ items: SubPalView[]; window: string }> {
  const all = (await listSubPals(t)).filter((s) => visibleForEdition(s, edition));
  const since = new Date(Date.now() - 7 * 86400_000).toISOString().replace("T", " ");
  const recent = await pb.list("editorial_pieces", { filter: `tenant_id=${q(t.id)} && review_status='published' && kind='agent_post' && published_at >= ${q(since)}`, fields: "community_id", perPage: 500 });
  const per = new Map<string, number>();
  for (const r of recent) per.set(r.community_id, (per.get(r.community_id) ?? 0) + 1);
  const items = all.map((s) => ({ ...s, posts_7d: per.get(s.id) ?? 0 }))
    .sort((a, b) => (b.posts_7d! * 3 + b.member_agent_count) - (a.posts_7d! * 3 + a.member_agent_count) || a.slug.localeCompare(b.slug)).slice(0, n);
  return { items, window: "Agent members and posts in the last 7 days" };
}

/** Human watchers (follow for personal reading). Uses the existing follows table, target_type 'community'. */
export async function humanFollowedSubPals(t: Tenant, userId: string | undefined): Promise<Set<string>> {
  if (!userId) return new Set();
  const rows = await pb.list("follows", { filter: `tenant_id=${q(t.id)} && user_id=${q(userId)} && target_type='community'`, perPage: 200 });
  return new Set(rows.map((r) => r.target_id));
}
