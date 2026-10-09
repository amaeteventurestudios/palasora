"use client";
import { useT } from "@/lib/i18n/client";
import { useEffect, useMemo, useRef, useState } from "react";
import { MessageSquare } from "lucide-react";
import type { PostView } from "@/lib/repo/thread";
import { PostCard } from "./PostCard";
import { LiveStatus, useLive } from "./LiveEvents";
import { CommentForm } from "../CommentForm";
import { VoteButton } from "../MemberButtons";
import { ReportForm } from "../ReportForm";

type Props = {
  pieceId: string; initial: PostView[]; claimIndex: Record<string, number>; signedIn: boolean; verified: boolean; returnPath: string; open: boolean;
};

const MAX_VISUAL_INDENT = 3; // deeper replies keep a "Replying to" breadcrumb instead of squeezing the column

export function LiveThread({ pieceId, initial, claimIndex, signedIn, verified, returnPath, open }: Props) {
  const [posts, setPosts] = useState<PostView[]>(initial);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const [offscreen, setOffscreen] = useState<string | null>(null);
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const ctx = useLive();
  const t = useT();
  const known = useRef(new Set(initial.map((p) => p.id)));

  useEffect(() => ctx?.subscribe((e) => {
    if (e.piece_id !== pieceId) return;
    if (e.type === "reply_published" && e.payload?.post) {
      const p = e.payload.post as PostView;
      if (known.current.has(p.id)) return; // duplicate delivery
      known.current.add(p.id);
      setPosts((xs) => [...xs, p]);
      setFresh((s) => new Set(s).add(p.id));
      requestAnimationFrame(() => {
        const el = document.getElementById(`post-${p.id}`);
        if (el) { const r = el.getBoundingClientRect(); if (r.top > window.innerHeight || r.bottom < 0) setOffscreen(p.id); }
      });
    }
    if (e.type === "post_removed" && e.post_id) setPosts((xs) => xs.filter((x) => x.id !== e.post_id));
  }), [ctx, pieceId]);

  const byParent = useMemo(() => {
    const m = new Map<string, PostView[]>();
    const ids = new Set(posts.map((p) => p.id));
    for (const p of posts) {
      const key = p.parent_id && ids.has(p.parent_id) ? p.parent_id : "";
      m.set(key, [...(m.get(key) ?? []), p]);
    }
    return m;
  }, [posts]);
  const byId = useMemo(() => new Map(posts.map((p) => [p.id, p])), [posts]);
  const label = (p?: PostView) => (p ? (p.author_kind === "editorial_ai" ? p.role_label : p.author?.display_name ?? "a reader") : "");
  const aiCount = posts.filter((p) => p.author_kind === "editorial_ai").length;
  const humanCount = posts.length - aiCount;

  const render = (parent: string, level: number): React.ReactNode => {
    const kids = byParent.get(parent) ?? [];
    if (!kids.length) return null;
    const indent = level > 0 && level <= MAX_VISUAL_INDENT;
    return (
      <ol className={`flex flex-col gap-3 ${indent ? "ms-3 border-s-2 border-border ps-3 sm:ms-5 sm:ps-4" : ""}`} aria-label={level === 0 ? "Replies to the topic" : undefined}>
        {kids.map((p) => (
          <li key={p.id} className="flex flex-col gap-3">
            <PostCard p={p} isNew={fresh.has(p.id)} claimIndex={claimIndex} parentLabel={level >= MAX_VISUAL_INDENT && p.parent_id ? label(byId.get(p.parent_id)) : undefined}>
              {open && <button type="button" className="inline-flex min-h-[32px] items-center gap-1 text-sm font-semibold text-muted hover:text-foreground" aria-expanded={replyTo === p.id}
                onClick={() => setReplyTo(replyTo === p.id ? null : p.id)}><MessageSquare size={14} aria-hidden="true" />{t("thread.reply")}</button>}
              {p.author_kind === "human" && <VoteButton kind="comment" id={p.id} score={p.vote_score} voted={false} signedIn={signedIn} returnPath={`${returnPath}#post-${p.id}`} label="Upvote reply" />}
              <ReportForm type="comment" id={p.id} />
            </PostCard>
            {replyTo === p.id && (
              <div className="ms-3 sm:ms-5"><CommentForm pieceId={pieceId} parentId={p.id} returnPath={`${returnPath}#post-${p.id}`} signedIn={signedIn} verified={verified} label={`${t("thread.reply")}: ${label(p)}`} /></div>
            )}
            {render(p.id, level + 1)}
          </li>
        ))}
      </ol>
    );
  };

  return (
    <div data-testid="live-thread" data-piece-id={pieceId}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="meta" data-testid="thread-counts">{t("thread.counts", { ai: aiCount, human: humanCount })}</p>
        <LiveStatus />
      </div>
      <div className="mt-3">{posts.length ? render("", 0) : <p className="text-muted">{t("thread.none")}</p>}</div>
      {offscreen && (
        <button type="button" className="btn btn-primary fixed bottom-20 left-1/2 z-30 -translate-x-1/2 shadow-lg" onClick={() => { document.getElementById(`post-${offscreen}`)?.scrollIntoView({ block: "center" }); setOffscreen(null); }}>
          {t("thread.newBelow")}
        </button>
      )}
    </div>
  );
}
