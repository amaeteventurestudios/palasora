// Thread (nested reply tree) and event-log repository. Tenant-scoped; public data only.
import { pb, q, type Rec } from "../pb";
import type { Tenant } from "../tenant";
import { publicFilter } from "./pieces";

export type PostView = {
  id: string; parent_id: string; author_kind: "human" | "editorial_ai" | "org_agent"; role_id: string; role_label: string;
  author: { handle: string; display_name: string } | null; body_text: string; created: string; depth: number; claim_ids: string[];
  vote_score: number; edited: boolean; new_angle: string; model?: string; latency_ms?: number;
};

let roleCache: { at: number; tenant: string; labels: Record<string, string> } | null = null;
export async function roleLabels(t: Tenant): Promise<Record<string, string>> {
  if (roleCache && roleCache.tenant === t.id && Date.now() - roleCache.at < 300_000) return roleCache.labels;
  const rows = await pb.list("ai_roles", { filter: `tenant_id=${q(t.id)}`, perPage: 20 });
  roleCache = { at: Date.now(), tenant: t.id, labels: Object.fromEntries(rows.map((r) => [r.key, r.label])) };
  return roleCache.labels;
}

export function toPostView(r: Rec, labels: Record<string, string>, authors: Map<string, Rec>): PostView {
  const a = r.author_id ? authors.get(r.author_id) : undefined;
  return {
    id: r.id, parent_id: r.parent_id ?? "", author_kind: r.author_kind, role_id: r.role_id ?? "", role_label: labels[r.role_id] ?? (r.author_kind === "editorial_ai" ? "Editorial AI" : ""),
    author: a ? { handle: a.handle, display_name: a.account_status === "deleted" ? "Deleted account" : a.display_name } : null,
    body_text: r.body_text, created: r.created, depth: r.depth || 1, claim_ids: r.claim_ids ?? [], vote_score: r.vote_score ?? 0,
    edited: (r.edit_revision ?? 1) > 1, new_angle: r.new_angle ?? "", model: r.provenance?.model, latency_ms: r.provenance?.latency_ms,
  };
}

export async function getThreadPosts(t: Tenant, pieceId: string): Promise<PostView[]> {
  const rows = await pb.list("comments", {
    filter: `tenant_id=${q(t.id)} && piece_id=${q(pieceId)} && approval_state='approved' && moderation_status='visible'`, sort: "created", perPage: 300,
  });
  const ids = [...new Set(rows.filter((r) => r.author_id).map((r) => r.author_id))];
  const authors = new Map<string, Rec>();
  if (ids.length) for (const u of await pb.list("users", { filter: ids.map((i) => `id=${q(i)}`).join(" || "), perPage: 200 })) if (u.tenant_id === t.id) authors.set(u.id, u);
  const labels = await roleLabels(t);
  // Human posts whose author is not in this tenant are dropped (defense in depth).
  return rows.filter((r) => r.author_kind !== "human" || authors.has(r.author_id)).map((r) => toPostView(r, labels, authors));
}

export type ThreadEvent = { seq: number; type: string; piece_id: string; post_id: string; parent_id: string; author_kind: string; role_id: string; created: string; payload: Record<string, unknown> };

/** Public events after `cursor` (exclusive). Payloads only reference content that is already public. */
export async function eventsSince(t: Tenant, cursor: number, pieceId?: string, limit = 100): Promise<ThreadEvent[]> {
  let f = `tenant_id=${q(t.id)} && visibility='public' && seq > ${Math.max(0, Math.floor(cursor))}`;
  if (pieceId) f += ` && piece_id=${q(pieceId)}`;
  const rows = await pb.list("thread_events", { filter: f, sort: "seq", perPage: limit });
  return rows.map((r) => ({ seq: r.seq, type: r.event_type, piece_id: r.piece_id, post_id: r.post_id, parent_id: r.parent_id, author_kind: r.author_kind,
    role_id: r.role_id, created: r.created, payload: r.payload ?? {} }));
}

export async function latestSeq(t: Tenant): Promise<number> {
  const r = await pb.first("thread_events", `tenant_id=${q(t.id)}`, "-seq");
  return r?.seq ?? 0;
}

/** Append an event after a human post is persisted (same ordered log the worker uses). */
export async function emitEvent(t: Tenant, e: { event_type: string; piece_id: string; post_id?: string; parent_id?: string; author_kind: string; role_id?: string; payload?: Record<string, unknown> }) {
  for (let i = 0; i < 8; i++) {
    const seq = (await latestSeq(t)) + 1;
    try {
      return await pb.create("thread_events", { tenant_id: t.id, seq, visibility: "public", post_id: "", parent_id: "", role_id: "", payload: {}, ...e });
    } catch { await new Promise((r) => setTimeout(r, 40)); }
  }
  return null;
}

/** Recent public activity for the Live Activity rail (committed events only). */
export async function recentActivity(t: Tenant, n = 8) {
  const ev = await pb.list("thread_events", { filter: `tenant_id=${q(t.id)} && visibility='public' && (event_type='reply_published' || event_type='topic_published')`, sort: "-seq", perPage: n * 2 });
  const pieceIds = [...new Set(ev.map((e) => e.piece_id))];
  const pieces = pieceIds.length ? await pb.list("editorial_pieces", { filter: `${publicFilter(t)} && (${pieceIds.map((i) => `id=${q(i)}`).join(" || ")})`, perPage: 50 }) : [];
  const pm = new Map(pieces.map((p) => [p.id, p]));
  const labels = await roleLabels(t);
  return ev.filter((e) => pm.has(e.piece_id)).slice(0, n).map((e) => ({
    seq: e.seq, type: e.event_type, created: e.created, author_kind: e.author_kind, role_label: labels[e.role_id] ?? "", piece_slug: pm.get(e.piece_id)!.slug,
    piece_kind: pm.get(e.piece_id)!.kind, headline: pm.get(e.piece_id)!.headline, post_id: e.post_id, is_demo: !!pm.get(e.piece_id)!.is_demo,
  }));
}
