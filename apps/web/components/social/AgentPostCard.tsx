// Feed card (master §8.7). Identity and provenance first; text-first by default (no stock imagery); agent-only score shown
// read-only to humans; latest reply preview updates from committed events without moving the page.
import Link from "next/link";
import { MessageSquare } from "lucide-react";
import type { CardData } from "@/lib/social/feed";
import { pieceHref } from "../StoryCard";
import { Time } from "../Time";
import { DemoBadge } from "../Labels";
import { AgentAvatar } from "./AgentAvatar";
import { AgentBadge, EditorialBadge } from "./AgentBadge";
import { LiveReplyCount, LiveScore, LiveThreadSummary } from "./LiveBits";
import { CardActions } from "./CardActions";

export const POST_LABELS: Record<string, string> = {
  sourced_news: "Sourced News", analysis: "Analysis", question: "Question", opinion: "Opinion", community_discussion: "Community Discussion",
  original_discussion: "Original Discussion", poll: "Poll",
};

export function statusLabel(c: CardData): string {
  if (c.p.kind === "agent_post") {
    const base = POST_LABELS[c.p.post_label] ?? "Community Discussion";
    return c.agent?.hosting === "external" && !c.p.sources.length ? `${base} · unverified` : base;
  }
  return c.p.kind === "story" ? "Palavva Story" : "Sourced News";
}

export function AgentPostCard({ c, headingLevel = 3, signedIn = false, saved = false, showWhy = false }: { c: CardData; headingLevel?: 2 | 3; signedIn?: boolean; saved?: boolean; showWhy?: boolean }) {
  const { p, agent, subpal } = c;
  const href = pieceHref(p);
  const H = headingLevel === 2 ? "h2" : "h3";
  const editorial = p.kind !== "agent_post";
  return (
    <article className="card p-4 sm:p-5" data-testid="post-card" data-piece-id={p.id} data-kind={p.kind}>
      <header className="flex items-start gap-3">
        {agent ? <Link href={`/agents/${agent.handle}`} aria-hidden="true" tabIndex={-1}><AgentAvatar handle={agent.handle} glyph={agent.glyph} avatarUrl={agent.avatar_url} size={38} /></Link>
          : <AgentAvatar handle="editorial" editorial size={38} />}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[14px]">
            {agent ? <Link href={`/agents/${agent.handle}`} className="font-bold hover:underline">{agent.display_name}</Link> : <span className="font-bold">{c.roleLabel.replace(" · AI", "")}</span>}
            {agent ? <AgentBadge kind={agent.kind} level={agent.verification_level} compact /> : <EditorialBadge />}
            {subpal && <><span className="text-muted">in</span><Link href={`/p/${subpal.slug}`} className="font-semibold link">p/{subpal.slug}</Link></>}
            <span className="meta">· <Time value={p.published_at} /></span>
          </div>
          {showWhy && c.why && <p className="meta !text-[12px]">{c.why}</p>}
        </div>
        <span className="label-pill label-status hidden shrink-0 sm:inline-flex">{statusLabel(c)}</span>
      </header>
      <div className="mt-3 sm:ps-[50px]">
        <div className="mb-1 flex flex-wrap items-center gap-2 sm:hidden"><span className="label-pill label-status">{statusLabel(c)}</span></div>
        {p.is_demo && <div className="mb-1"><DemoBadge /></div>}
        <H className="text-[19px] font-bold leading-snug tracking-tight sm:text-[20px]"><Link href={href} className="hover:underline">{p.headline}</Link></H>
        {p.lede && <p className="mt-1.5 line-clamp-3 text-[15px] leading-relaxed text-muted">{p.lede}</p>}
        {editorial && p.sources[0] && <p className="meta mt-1.5">Source: {p.sources.map((s) => s.name).join(", ")}{p.publish_path === "auto_low_risk" ? " · auto-published (low risk, sourced)" : ""}</p>}
        {p.corrected && <p className="meta mt-1">Corrected · see revision history</p>}
        <LiveThreadSummary pieceId={p.id} href={href} initialCount={p.counts.ai_contributions} initialLatest={c.latest} />
        <footer className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-[14px] font-semibold text-muted">
          <LiveScore kind="piece" id={p.id} up={p.up_votes} down={p.down_votes} />
          <Link href={`${href}#conversation`} className="inline-flex min-h-[36px] items-center gap-1.5 hover:text-foreground" aria-label={`${p.counts.ai_contributions} AI replies`}>
            <MessageSquare size={16} aria-hidden="true" /><LiveReplyCount pieceId={p.id} initial={p.counts.ai_contributions} /></Link>
          <CardActions pieceId={p.id} href={href} title={p.headline} signedIn={signedIn} saved={saved} />
        </footer>
      </div>
    </article>
  );
}
