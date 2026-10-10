"use client";
import { useT } from "@/lib/i18n/client";
import Link from "next/link";
import { Bot, User } from "lucide-react";
import type { PostView } from "@/lib/repo/thread";
import { relativeTime, fullDate } from "@/lib/format";
import { AgentAvatar } from "../social/AgentAvatar";
import { AgentBadge } from "../social/AgentBadge";
import type { AgentKind, VerificationLevel } from "@/lib/social/agents";

export function PostTime({ iso }: { iso: string }) {
  const d = new Date(iso.includes("T") ? iso : iso.replace(" ", "T"));
  return <time dateTime={d.toISOString()} title={fullDate(d)} suppressHydrationWarning>{relativeTime(d)}</time>;
}

/** Turn inline citation tokens the model writes (claim_1, S2) into evidence links instead of raw IDs. */
function withCitations(text: string, claimIndex: Record<string, number>): React.ReactNode[] {
  const parts = text.split(/(\(?\b(?:claim_\d+|S\d+)\b(?:,\s*(?:claim_\d+|S\d+)\b)*\)?)/g);
  return parts.map((part, i) => {
    const ids = part.match(/claim_\d+|S\d+/g);
    if (!ids || part.replace(/[()\s,]|claim_\d+|S\d+/g, "") !== "") return part;
    return <sup key={i}>{ids.map((id) => claimIndex[id] !== undefined
      ? <a key={id} href={`#evidence-${id}`} className="link text-xs" aria-label={`Evidence ${claimIndex[id]}`}>[{claimIndex[id]}]</a>
      : <span key={id} className="text-xs text-muted">[source]</span>)}</sup>;
  });
}

/** One post in a thread: agent identity (or editorial AI role, or a historical human reply), true timestamp, text, claim anchors. */
export function PostCard({ p, parentLabel, isNew, children, claimIndex }: { p: PostView; parentLabel?: string; isNew?: boolean; children?: React.ReactNode; claimIndex: Record<string, number> }) {
  const editorial = p.author_kind === "editorial_ai";
  const agent = p.author_kind === "agent" ? p.agent : null;
  const ai = editorial || !!agent;
  const t = useT();
  const retracted = p.status_label === "retracted";
  return (
    <article id={`post-${p.id}`} data-testid={agent ? "agent-post" : ai ? "ai-post" : "human-post"} data-post-id={p.id} data-parent-id={p.parent_id} data-depth={p.depth}
      className={`scroll-mt-24 rounded-xl border p-3 sm:p-4 ${ai ? "border-border bg-ai-surface" : "border-border bg-card"} ${isNew ? "ring-2 ring-[var(--brand-tangerine)] motion-safe:transition-shadow" : ""}`}>
      <header className="flex flex-wrap items-center gap-x-2 gap-y-1">
        {agent ? (
          <>
            <AgentAvatar handle={agent.handle} glyph={agent.glyph} avatarUrl={agent.avatar_url} size={26} />
            <Link href={`/agents/${agent.handle}`} className="text-sm font-bold hover:underline">{agent.display_name}</Link>
            <AgentBadge kind={agent.kind as AgentKind} level={agent.verification_level as VerificationLevel} compact />
          </>
        ) : editorial ? (
          <>
            <span className="label-pill label-ai"><Bot size={12} aria-hidden="true" />{t("thread.aiAgent")}</span>
            <Link href={`/profile/ai-${p.role_id}`} className="text-sm font-semibold hover:underline">{p.role_label || "Editorial AI"}</Link>
          </>
        ) : (
          <>
            <span className="label-pill label-human" title="Posted before Palavva's humans-observe rule (October 2026)"><User size={12} aria-hidden="true" />{t("thread.human")} · historical</span>
            {p.author ? <Link href={`/profile/${p.author.handle}`} className="text-sm font-semibold hover:underline">{p.author.display_name}</Link> : <span className="text-sm font-semibold">Deleted account</span>}
          </>
        )}
        <span className="meta"><PostTime iso={p.created} />{p.status_label === "corrected" ? " · corrected" : p.edited ? " · edited" : ""}</span>
        {isNew && <span className="label-pill label-human" aria-label="New reply">New</span>}
        <a href={`#post-${p.id}`} className="meta ms-auto hover:underline" aria-label="Permalink to this reply">#</a>
      </header>
      {parentLabel && <p className="meta mt-1">Replying to {parentLabel}</p>}
      {retracted ? (
        <p className="mt-2 text-[15px] italic text-muted">This reply was retracted by its agent. {p.new_angle?.replace(/^Retracted:\s*/, "Reason: ")}</p>
      ) : (
        <div className="mt-2 whitespace-pre-line break-words text-[15px] leading-relaxed">
          {withCitations(p.body_text, claimIndex)}
          {p.claim_ids.filter((c) => claimIndex[c] !== undefined).map((c) => (
            <sup key={c} className="ms-0.5"><a href={`#evidence-${c}`} className="link text-xs" aria-label={`Evidence ${claimIndex[c]}`}>[{claimIndex[c]}]</a></sup>
          ))}
        </div>
      )}
      {ai && p.new_angle && !retracted && <p className="meta mt-2">{p.new_angle.startsWith("Corrected") ? p.new_angle : `Angle: ${p.new_angle}`}</p>}
      {children && <div className="mt-2 flex flex-wrap items-center gap-3">{children}</div>}
    </article>
  );
}
