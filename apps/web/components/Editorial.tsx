import Link from "next/link";
import { Bot, ExternalLink, History, Info, User } from "lucide-react";
import type { SourceRef, CommentView } from "@/lib/repo/pieces";
import { Time } from "./Time";
import { fullDate, parsePbDate } from "@/lib/format";

export type Block = { text: string; claim_ids?: string[] };

/** Paragraph with claim anchors linking into the evidence list. */
export function ClaimText({ block, claimIndex }: { block: Block; claimIndex: Record<string, number> }) {
  const ids = (block.claim_ids ?? []).filter((c) => claimIndex[c] !== undefined);
  return (
    <p>
      {block.text}
      {ids.map((c) => (
        <sup key={c} className="ms-0.5"><a href={`#evidence-${c}`} className="link text-xs" aria-label={`Evidence ${claimIndex[c]}`}>[{claimIndex[c]}]</a></sup>
      ))}
    </p>
  );
}

export function SourceCitation({ s, i }: { s: SourceRef; i: number }) {
  const d = parsePbDate(s.published_at);
  const fixture = s.url.includes("example.invalid");
  return (
    <li className="flex gap-3 py-3">
      <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-card-muted text-xs font-bold">{i + 1}</span>
      <div className="min-w-0">
        <p className="font-semibold">{s.name}</p>
        {fixture ? (
          <p className="text-sm text-muted-foreground break-words">{s.title ?? s.url} <span className="italic">(fixture link, intentionally not clickable)</span></p>
        ) : (
          <a href={s.url} target="_blank" rel="noopener noreferrer nofollow" data-source-link={String(i)} className="link break-words text-sm">
            {s.title ?? s.url}<ExternalLink size={12} className="ms-1 inline" aria-hidden="true" /><span className="sr-only"> (opens the original publisher in a new tab)</span>
          </a>
        )}
        {d && <p className="meta">Published by the source: <time dateTime={d.toISOString()}>{fullDate(d)}</time></p>}
        {(s as SourceRef & { author?: string; license?: string; license_url?: string; language?: string }).license && (
          <p className="meta" data-testid="source-license">
            {(s as { author?: string }).author ? <>By {(s as { author?: string }).author} · </> : null}
            {(s as { license_url?: string }).license_url ? <a className="link" href={(s as { license_url?: string }).license_url} target="_blank" rel="noopener noreferrer license">{(s as { license?: string }).license}</a> : (s as { license?: string }).license}
            {" "}· Summarized and analyzed by Palavva (changes made){(s as { language?: string }).language && (s as { language?: string }).language !== "en" ? ` · Original language: ${(s as { language?: string }).language}` : ""}
          </p>
        )}
      </div>
    </li>
  );
}

export function AIContribution({ c, roleLabel, claimIndex }: { c: CommentView; roleLabel: string; claimIndex: Record<string, number> }) {
  return (
    <article className="rounded-xl border border-border bg-ai-surface p-4" data-testid="ai-contribution">
      <header className="flex flex-wrap items-center gap-2">
        <span className="label-pill label-ai"><Bot size={12} aria-hidden="true" />AI analysis</span>
        <Link href={`/profile/ai-${c.role_id}`} className="text-sm font-semibold hover:underline">{roleLabel}</Link>
        <span className="meta"><Time value={c.created} /></span>
      </header>
      <div className="mt-2"><ClaimText block={{ text: c.body_text, claim_ids: c.claim_ids }} claimIndex={claimIndex} /></div>
    </article>
  );
}

export function AINote() {
  return (
    <p className="flex gap-2 text-sm text-muted-foreground"><Info size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
      <span>This analysis was generated with AI from linked materials. It can make mistakes. Check the sources and read our <Link href="/ai-transparency" className="link">AI transparency policy</Link>.</span>
    </p>
  );
}

export function HumanComment({ c, children }: { c: CommentView; children?: React.ReactNode }) {
  return (
    <article className="border-b border-border py-4 last:border-0" id={`comment-${c.id}`} data-testid="human-comment">
      <header className="flex flex-wrap items-center gap-2">
        <span className="label-pill label-human"><User size={12} aria-hidden="true" />Community response</span>
        {c.author ? <Link href={`/profile/${c.author.handle}`} className="font-semibold hover:underline">{c.author.display_name}</Link> : <span className="font-semibold">Deleted account</span>}
        <span className="meta"><Time value={c.created} />{c.edited ? " · edited" : ""}</span>
      </header>
      <div className="mt-2 whitespace-pre-line break-words">{c.body_text}</div>
      {children && <div className="mt-2 flex flex-wrap items-center gap-3">{children}</div>}
    </article>
  );
}
