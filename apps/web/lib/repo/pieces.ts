// Published-content repository. Every query is pinned to the host-resolved tenant and
// to review_status='published'. Drafts never leave this module through public functions.
import { env } from "../env";
import { pb, q, type Rec } from "../pb";
import type { Tenant } from "../tenant";
import { rankPieces, type FeedMode, decodeCursor, encodeCursor } from "../feed";

export type SourceRef = { name: string; url: string; title?: string; published_at?: string };
export type PieceSummary = {
  id: string; slug: string; kind: string; headline: string; lede: string;
  country_codes: string[]; topic_slugs: string[]; language: string;
  published_at: string; first_published_at: string; updated_at: string;
  sources: SourceRef[]; is_demo: boolean; editor_pick: boolean; still_developing: boolean; corrected: boolean;
  counts: { human_comments: number; ai_contributions: number; votes: number; saves: number };
  is_sponsored: false;
  initiator_role: string; thread_state: string; publish_path: string; origin_country: string; original_language: string; area_ids: string[];
  revision: number; source_language: string;
};

export function publicFilter(t: Tenant): string {
  let f = `tenant_id=${q(t.id)} && review_status='published'`;
  if (!t.isDemo && !env.showDemo) f += " && is_demo=false";
  return f;
}

const CODE = /^[A-Z]{2}$/;
const SLUG = /^[a-z0-9-]{1,60}$/;
const LANG = /^[a-z]{2}(-[A-Z]{2})?$/;

export function toSummary(r: Rec): PieceSummary {
  return {
    id: r.id, slug: r.slug, kind: r.kind, headline: r.headline, lede: r.lede ?? "",
    country_codes: r.country_codes ?? [], topic_slugs: r.topic_slugs ?? [], language: r.language || "en",
    published_at: r.published_at, first_published_at: r.first_published_at || r.published_at,
    updated_at: r.material_updated_at || r.published_at,
    sources: Array.isArray(r.sources_json) ? r.sources_json : [],
    is_demo: !!r.is_demo, editor_pick: !!r.editor_pick, still_developing: !!r.still_developing, corrected: (r.revision ?? 1) > 1 && !!r.correction_note,
    counts: { human_comments: r.human_comment_count ?? 0, ai_contributions: Math.max(r.ai_post_count ?? 0, r.ai_contribution_count ?? 0), votes: r.vote_score ?? 0, saves: r.save_count ?? 0 },
    is_sponsored: false,
    initiator_role: r.initiator_role ?? "", thread_state: r.thread_state ?? "", publish_path: r.publish_path ?? "", origin_country: r.origin_country ?? "",
    original_language: r.original_language || r.language || "en", area_ids: Array.isArray(r.area_ids) ? r.area_ids : [],
    revision: r.revision ?? 1, source_language: (Array.isArray(r.sources_json) && r.sources_json[0]?.language) || "en",
  };
}

const feedCache = new Map<string, { at: number; rows: Promise<Rec[]> }>();
const FEED_TTL_MS = 5_000;
async function cachedList(filter: string): Promise<Rec[]> {
  const hit = feedCache.get(filter);
  if (hit && Date.now() - hit.at < FEED_TTL_MS) return hit.rows;
  const rows = pb.list("editorial_pieces", { filter, sort: "-published_at", perPage: 300 });
  feedCache.set(filter, { at: Date.now(), rows });
  if (feedCache.size > 500) feedCache.clear();
  rows.catch(() => feedCache.delete(filter));
  return rows;
}
/** Called after publish/correction/retraction/vote so readers see changes immediately. */
export function invalidateFeedCache(tenantId?: string) {
  for (const k of feedCache.keys()) if (!tenantId || k.includes(tenantId)) feedCache.delete(k);
}

export type FeedQuery = { mode: FeedMode; country?: string; topic?: string; lang?: string; cursor?: string; limit?: number; seed?: string; area?: string; editionBoost?: string };

export async function listFeed(t: Tenant, fq: FeedQuery): Promise<{ items: PieceSummary[]; nextCursor: string | null; total: number }> {
  let f = publicFilter(t);
  if (fq.country && CODE.test(fq.country)) f += ` && country_codes~${q(`"${fq.country}"`)}`;
  if (fq.topic && SLUG.test(fq.topic)) f += ` && topic_slugs~${q(`"${fq.topic}"`)}`;
  if (fq.lang && LANG.test(fq.lang)) f += ` && language=${q(fq.lang)}`;
  if (fq.mode === "discover") f += " && editor_pick=true";
  if (fq.area && /^[A-Z]{2}-[A-Z0-9]{1,3}$/.test(fq.area)) f += ` && area_ids~${q(`"${fq.area}"`)}`;
  // Bounded candidate window (MVP scale); ranking happens in feed.ts. Published-only rows are
  // micro-cached per tenant+filter for 5 s (keyed by tenant id, so no cross-tenant reuse).
  const rows = await cachedList(f);
  let ranked = rankPieces(rows.map(toSummary), fq.mode, fq.seed);
  // Home edition relevance (handoff §0): on unfiltered home feeds, recent edition-country items come first; nothing is hidden.
  if (fq.editionBoost && fq.editionBoost !== "ALL" && !fq.country && (fq.mode === "live" || fq.mode === "new")) {
    const week = Date.now() - 7 * 86400_000;
    const isHome = (p: PieceSummary) => p.country_codes.includes(fq.editionBoost!) && new Date(p.published_at.replace(" ", "T")).getTime() > week;
    ranked = [...ranked.filter(isHome), ...ranked.filter((p) => !isHome(p))];
  }
  const limit = Math.min(Math.max(fq.limit ?? 20, 1), 20);
  const offset = decodeCursor(fq.cursor);
  const items = ranked.slice(offset, offset + limit);
  return { items, nextCursor: offset + limit < ranked.length ? encodeCursor(offset + limit) : null, total: ranked.length };
}

export async function getPublishedPiece(t: Tenant, slug: string): Promise<Rec | null> {
  if (!/^[a-z0-9-]{1,120}$/.test(slug)) return null;
  return pb.first("editorial_pieces", `${publicFilter(t)} && slug=${q(slug)}`);
}

export async function getPublishedPieceById(t: Tenant, id: string): Promise<Rec | null> {
  if (!/^[a-z0-9]{10,20}$/.test(id)) return null;
  return pb.first("editorial_pieces", `${publicFilter(t)} && id=${q(id)}`);
}

export async function getRedirect(t: Tenant, path: string): Promise<string | null> {
  const r = await pb.first("redirects", `tenant_id=${q(t.id)} && old_path=${q(path)} && active=true`);
  return r?.new_path ?? null;
}

export type CommentView = {
  id: string; author_kind: "human" | "editorial_ai" | "org_agent"; role_id: string; body_text: string; created: string;
  parent_id: string; author: { handle: string; display_name: string } | null; claim_ids: string[]; vote_score: number; edited: boolean;
};

export async function getDiscussion(t: Tenant, pieceId: string) {
  const disc = await pb.first("discussions", `tenant_id=${q(t.id)} && piece_id=${q(pieceId)}`);
  if (!disc) return { discussion: null, ai: [] as CommentView[], human: [] as CommentView[] };
  const rows = await pb.list("comments", {
    filter: `tenant_id=${q(t.id)} && discussion_id=${q(disc.id)} && approval_state='approved' && moderation_status='visible'`,
    sort: "created", perPage: 200,
  });
  const authorIds = [...new Set(rows.filter((r) => r.author_id).map((r) => r.author_id))];
  const authors = new Map<string, Rec>();
  if (authorIds.length) {
    const us = await pb.list("users", { filter: authorIds.map((id) => `id=${q(id)}`).join(" || "), perPage: 200 });
    // Defense in depth: drop any author not in this tenant.
    for (const u of us) if (u.tenant_id === t.id) authors.set(u.id, u);
  }
  const view = (r: Rec): CommentView => ({
    id: r.id, author_kind: r.author_kind, role_id: r.role_id ?? "", body_text: r.body_text, created: r.created, parent_id: r.parent_id ?? "",
    author: authors.has(r.author_id) ? { handle: authors.get(r.author_id)!.handle, display_name: authors.get(r.author_id)!.display_name } : null,
    claim_ids: r.claim_ids ?? [], vote_score: r.vote_score ?? 0, edited: (r.edit_revision ?? 1) > 1,
  });
  return {
    discussion: disc,
    ai: rows.filter((r) => r.author_kind === "editorial_ai").map(view),
    human: rows.filter((r) => r.author_kind !== "editorial_ai" && (r.author_kind !== "human" || authors.has(r.author_id))).map(view),
  };
}

export async function getClaims(t: Tenant, clusterId: string) {
  if (!clusterId) return [];
  return pb.list("evidence_claims", { filter: `tenant_id=${q(t.id)} && cluster_id=${q(clusterId)}`, sort: "claim_key", perPage: 100 });
}

export async function getTimeLens(t: Tenant, pieceId: string) {
  return pb.list("time_lens_entries", { filter: `tenant_id=${q(t.id)} && piece_id=${q(pieceId)} && status='published'`, sort: "era", perPage: 20 });
}

export async function getPublicCorrections(t: Tenant, pieceId?: string) {
  let f = `tenant_id=${q(t.id)} && status='published'`;
  if (pieceId) f += ` && piece_id=${q(pieceId)}`;
  return pb.list("corrections", { filter: f, sort: "-public_at", perPage: 100 });
}

export async function getRevisions(t: Tenant, pieceId: string) {
  return pb.list("piece_revisions", { filter: `tenant_id=${q(t.id)} && piece_id=${q(pieceId)} && is_public_correction=true`, sort: "-revision", perPage: 50 });
}

export async function relatedPieces(t: Tenant, piece: Rec, n = 4): Promise<PieceSummary[]> {
  const topic = (piece.topic_slugs ?? [])[0];
  const country = (piece.country_codes ?? [])[0];
  let f = `${publicFilter(t)} && id!=${q(piece.id)}`;
  const ors: string[] = [];
  if (topic) ors.push(`topic_slugs~${q(`"${topic}"`)}`);
  if (country) ors.push(`country_codes~${q(`"${country}"`)}`);
  if (ors.length) f += ` && (${ors.join(" || ")})`;
  const rows = await pb.list("editorial_pieces", { filter: f, sort: "-published_at", perPage: n });
  return rows.map(toSummary);
}

/** Fallback search when the FTS sidecar is unavailable: bounded LIKE over published pieces only. */
export async function fallbackSearch(t: Tenant, term: string, country?: string, topic?: string): Promise<PieceSummary[]> {
  const words = term.toLowerCase().split(/\s+/).filter((w) => w.length > 1).slice(0, 5);
  if (!words.length) return [];
  let f = publicFilter(t) + " && (" + words.map((w) => `(headline~${q(w)} || lede~${q(w)})`).join(" && ") + ")";
  if (country && CODE.test(country)) f += ` && country_codes~${q(`"${country}"`)}`;
  if (topic && SLUG.test(topic)) f += ` && topic_slugs~${q(`"${topic}"`)}`;
  const rows = await pb.list("editorial_pieces", { filter: f, sort: "-published_at", perPage: 20 });
  return rows.map(toSummary);
}
