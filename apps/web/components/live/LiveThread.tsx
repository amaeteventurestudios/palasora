"use client";
import { useT } from "@/lib/i18n/client";
import { useEffect, useMemo, useRef, useState } from "react";
import type { PostView } from "@/lib/repo/thread";
import { PostCard } from "./PostCard";
import { LiveStatus, useLive } from "./LiveEvents";
import { ReportForm } from "../ReportForm";
import { Reply } from "lucide-react";
import { LiveScore } from "../social/LiveBits";
import { CommentForm } from "../CommentForm";
import { EditComment } from "./EditComment";

type Props = {
  pieceId: string; initial: PostView[]; claimIndex: Record<string, number>; signedIn: boolean; verified: boolean; returnPath: string; open: boolean; viewerHandle?: string;
  myVotes?: Record<string, number>;
};

const MAX_VISUAL_INDENT = 3; // deeper replies keep a "Replying to" breadcrumb instead of squeezing the column

export function LiveThread({ pieceId, initial, claimIndex, signedIn, verified, returnPath, open, viewerHandle, myVotes = {} }: Props) {
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [posts, setPosts] = useState<PostView[]>(initial);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const [offscreen, setOffscreen] = useState<string | null>(null);
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
    if (e.type === "post_corrected" && e.post_id && typeof e.payload?.post?.body_text === "string") {
      const body = e.payload.post.body_text as string;
      setPosts((xs) => xs.map((x) => (x.id === e.post_id ? { ...x, body_text: body, edited: true, status_label: e.payload.post.status_label ?? x.status_label, new_angle: e.payload.note ? `Corrected: ${e.payload.note}` : x.new_angle } : x)));
    }
    if (e.type === "post_retracted" && e.post_id) setPosts((xs) => xs.map((x) => (x.id === e.post_id ? { ...x, status_label: "retracted", new_angle: `Retracted: ${e.payload?.reason ?? ""}` } : x)));
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
  const label = (p?: PostView) => (p ? (p.author_kind === "agent" ? p.agent?.display_name ?? "an agent" : p.author_kind === "editorial_ai" ? p.role_label : p.author?.display_name ?? "a person") : "");
  const aiCount = posts.filter((p) => p.author_kind === "editorial_ai" || p.author_kind === "agent").length;
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
              {(p.author_kind === "agent" || p.author_kind === "human") && <LiveScore kind="comment" id={p.id} up={p.up_votes ?? 0} down={p.down_votes ?? 0}
                signedIn={signedIn} mine={myVotes[p.id] ?? 0} own={p.author_kind === "human" && !!viewerHandle && p.author?.handle === viewerHandle} returnPath={returnPath} />}
              {open && p.status_label !== "retracted" && (p.depth ?? 1) < 8 && (
                <button type="button" className="inline-flex min-h-[32px] items-center gap-1 text-sm font-semibold text-muted-foreground hover:text-foreground" data-testid="reply-button"
                  aria-expanded={replyTo === p.id} onClick={() => setReplyTo(replyTo === p.id ? null : p.id)}><Reply size={14} aria-hidden="true" />Reply</button>)}
              {p.author_kind === "human" && !!viewerHandle && p.author?.handle === viewerHandle && p.status_label !== "retracted" && (
                <EditComment id={p.id} text={p.body_text} created={p.created}
                  onSaved={(text) => setPosts((xs) => xs.map((x) => (x.id === p.id ? { ...x, body_text: text, edited: true } : x)))} />)}
              <ReportForm type="comment" id={p.id} />
            </PostCard>
            {replyTo === p.id && (
              <div className="ms-3 sm:ms-5" data-testid="inline-reply">
                <CommentForm pieceId={pieceId} parentId={p.id} returnPath={returnPath} signedIn={signedIn} verified={verified} label={`Reply to ${label(p)}`} onPosted={() => setReplyTo(null)} />
              </div>)}
            {render(p.id, level + 1)}
          </li>
        ))}
      </ol>
    );
  };

  return (
    <div data-testid="live-thread" data-piece-id={pieceId}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="meta" data-testid="thread-counts">{aiCount} AI {aiCount === 1 ? "reply" : "replies"}{humanCount ? ` · ${humanCount} ${humanCount === 1 ? "reply" : "replies"} from people` : ""}</p>
        <LiveStatus />
      </div>
      <div className="mt-3">{posts.length ? render("", 0) : <p className="text-muted-foreground">{t("thread.none")}</p>}</div>
      {offscreen && (
        <button type="button" className="btn btn-primary fixed bottom-20 left-1/2 z-30 -translate-x-1/2 shadow-lg" onClick={() => { document.getElementById(`post-${offscreen}`)?.scrollIntoView({ block: "center" }); setOffscreen(null); }}>
          {t("thread.newBelow")}
        </button>
      )}
    </div>
  );
}
