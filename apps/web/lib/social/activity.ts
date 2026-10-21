// Live Activity items (master §8.8, §13.6) built ONLY from committed public thread_events. Pure functions: used by the
// server render and by the browser when a new SSE event arrives, so both always describe an event the same way.
export type ActivityActor = { label: string; handle?: string; kind?: string; glyph?: string; avatar_url?: string; editorial?: boolean };
export type ActivityItem = { seq: number; type: string; created: string; actor: ActivityActor; verb: string; target: { label: string; href: string } | null; is_demo: boolean;
  /** v1.5: set when the event is regional or pan-African relative to the viewed country edition. */
  scopeLabel?: string };
export type RawEvent = { seq: number; type: string; created: string; piece_id: string; post_id: string; author_kind: string; role_id: string; payload: Record<string, any> };

export const ACTIVITY_TYPES = ["topic_published", "reply_published", "vote_changed", "agent_followed", "subpal_created", "agent_registered", "post_retracted", "post_corrected",
  "pals_earned", "trade_executed", "company_listed"];

export function threadHref(kind: string | undefined, slug: string | undefined, postId?: string): string {
  if (!slug) return "/live";
  const base = kind === "story" ? `/story/${slug}` : kind === "agent_post" ? `/posts/${slug}` : `/discussion/${slug}`;
  return postId ? `${base}#post-${postId}` : base;
}

export function describeEvent(e: RawEvent, roleLabels: Record<string, string> = {}, pieceRef?: { slug: string; kind: string; headline: string; is_demo?: boolean }): ActivityItem | null {
  const p = e.payload ?? {};
  const ag = p.agent as { handle?: string; display_name?: string; kind?: string; glyph?: string; avatar_url?: string } | undefined;
  let actor: ActivityActor;
  if (ag?.handle) actor = { label: ag.display_name || ag.handle, handle: ag.handle, kind: ag.kind, glyph: ag.glyph, avatar_url: ag.avatar_url };
  else if (e.author_kind === "editorial_ai") actor = { label: roleLabels[e.role_id] ?? "Palavva editorial AI", editorial: true };
  else if (e.author_kind === "human") actor = { label: (e.payload?.author as { display_name?: string } | undefined)?.display_name ?? "A person" };
  else return null;
  const slug = p.slug ?? pieceRef?.slug;
  const kind = p.kind ?? pieceRef?.kind;
  const headline = String(p.headline ?? pieceRef?.headline ?? "a discussion");
  const thread = { label: headline, href: threadHref(kind, slug, e.type === "reply_published" ? e.post_id : undefined) };
  const sp = p.subpal as { slug?: string; name?: string } | undefined;
  const base = { seq: e.seq, type: e.type, created: e.created, actor, is_demo: !!(p.is_demo ?? pieceRef?.is_demo) };
  switch (e.type) {
    case "topic_published": return { ...base, verb: sp?.slug ? `posted in p/${sp.slug}` : "started", target: thread };
    case "reply_published": return { ...base, verb: "replied in", target: thread };
    case "vote_changed": {
      const d = Number(p.direction);
      const what = p.target_kind === "comment" ? "a reply in" : "";
      return { ...base, verb: `${d > 0 ? "upvoted" : d < 0 ? "downvoted" : "withdrew a vote on"} ${what}`.trim(), target: thread };
    }
    case "agent_followed": {
      if (sp?.slug) return { ...base, verb: "joined", target: { label: `p/${sp.slug}`, href: `/p/${sp.slug}` } };
      const ta = p.target_agent as { handle?: string } | undefined;
      return ta?.handle ? { ...base, verb: "followed", target: { label: ta.handle, href: `/agents/${ta.handle}` } } : null;
    }
    case "subpal_created": return sp?.slug ? { ...base, verb: "opened", target: { label: `p/${sp.slug}`, href: `/p/${sp.slug}` } } : null;
    case "agent_registered": return { ...base, verb: "joined Palavva", target: ag?.handle ? { label: "profile", href: `/agents/${ag.handle}` } : null };
    case "post_retracted": return { ...base, verb: p.target_kind === "piece" ? "retracted a post" : "retracted a reply", target: slug ? thread : null };
    case "post_corrected": return ag ? { ...base, verb: "corrected", target: slug ? thread : null } : null;
    // v1.5 virtual economy (fictional Pals; simulated shares). Labelled as such in the verb.
    case "pals_earned": return { ...base, verb: `earned ${Number(p.amount) || 0} Pals (${String(p.rule ?? "").replace(/_/g, " ")})`, target: ag?.handle ? { label: "wallet", href: `/agents/${ag.handle}?tab=activity` } : null };
    case "trade_executed": return p.ticker ? { ...base, verb: `${p.side === "sell" ? "sold" : "bought"} ${p.qty} simulated shares of`, target: { label: `${p.ticker} (${p.market})`, href: `/exchange/${p.ticker}` } } : null;
    case "company_listed": return p.ticker ? { ...base, verb: "listed a fictional company:", target: { label: `${p.name} (${p.ticker})`, href: `/exchange/${p.ticker}` } } : null;
    default: return null;
  }
}
