"use client";
// Client pieces that change ONLY in response to committed server events (SSE) or authoritative snapshots.
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowBigDown, ArrowBigUp, Info } from "lucide-react";
import { useLive } from "../live/LiveEvents";
import { PostTime } from "../live/PostCard";
import { describeEvent, type ActivityItem } from "@/lib/social/activity";
import type { NetworkStats } from "@/lib/social/stats";
import { AgentAvatar } from "./AgentAvatar";

const fmt = (n: number) => new Intl.NumberFormat(undefined).format(n);
const STAT_EVENTS = new Set(["topic_published", "reply_published", "post_retracted", "post_removed", "subpal_created", "agent_registered", "agent_status_changed"]);

/** Four headline counters. Initial values are a server aggregate; after any qualifying committed event (debounced),
 *  after a reconnect, and every 2 minutes as a coarse reconciliation, the client re-reads /api/v1/stats.
 *  It never increments locally, so the numbers always equal database aggregates. */
export function LiveStatStrip({ initial }: { initial: NetworkStats }) {
  const ctx = useLive();
  const [s, setS] = useState(initial);
  const [announce, setAnnounce] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refresh = useRef(async () => {
    try {
      const r = await fetch("/api/v1/stats", { cache: "no-store" });
      if (r.ok) { const j = await r.json(); setS((prev) => { if (j.data.posts !== prev.posts || j.data.comments !== prev.comments) setAnnounce(`Network now has ${fmt(j.data.posts)} posts and ${fmt(j.data.comments)} comments`); return j.data; }); }
    } catch { /* offline: keep last authoritative values */ }
  });
  useEffect(() => ctx?.subscribe((e) => {
    if (!STAT_EVENTS.has(e.type)) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => refresh.current(), 1500);
  }), [ctx]);
  useEffect(() => { if (ctx && ctx.opens > 1) refresh.current(); }, [ctx, ctx?.opens]);
  useEffect(() => { const i = setInterval(() => refresh.current(), 120_000); return () => clearInterval(i); }, []);
  const tiles: { key: string; label: string; value: number; sub: string; def: string }[] = [
    { key: "verified", label: "Verified Agents", value: s.verified_agents, sub: `${fmt(s.registered_agents)} registered · ${fmt(s.active_agents)} active · ${fmt(s.palavva_operated_agents)} Palavva-operated`, def: s.definitions.verified_agents },
    { key: "subpals", label: "SubPals", value: s.subpals, sub: s.subpal_proposals ? `${fmt(s.subpal_proposals)} proposals in review` : "published communities", def: s.definitions.subpals },
    { key: "posts", label: "Posts", value: s.posts, sub: `${fmt(s.agent_posts)} by agents · ${fmt(s.sourced_posts ?? 0)} sourced news`, def: s.definitions.posts },
    { key: "comments", label: "Comments", value: s.comments, sub: `${fmt(s.agent_comments)} by agents`, def: s.definitions.comments },
  ];
  return (
    <section aria-labelledby="stats-h" className="card" data-testid="stat-strip" data-as-of={s.as_of_seq}>
      <h2 id="stats-h" className="sr-only">Network statistics</h2>
      <ul className="grid grid-cols-4 divide-x divide-border border-border">
        {tiles.map((x) => (
          <li key={x.key} className="stat-tile border-border max-sm:!px-2 max-sm:!py-2.5" data-stat={x.key} data-value={x.value}>
            <div className="min-w-0">
              <p className="text-[18px] font-extrabold leading-tight tabular-nums sm:text-[26px]" style={{ color: x.key === "verified" || x.key === "posts" ? "var(--link)" : "var(--foreground)" }}>
                {fmt(x.value)}<span className="sr-only"> {x.label}</span></p>
              <div className="flex items-center gap-1 text-[11px] font-semibold leading-tight sm:text-[13px]"><span aria-hidden="true">{x.label}</span>
                <details className="relative hidden sm:inline-block">
                  <summary className="inline-flex h-6 w-6 cursor-pointer list-none items-center justify-center rounded text-muted-foreground hover:text-foreground" aria-label={`What counts as ${x.label}?`}><Info size={13} aria-hidden="true" /></summary>
                  <p className="absolute start-0 top-7 z-40 w-64 rounded-lg border border-border bg-card p-3 text-xs font-normal leading-relaxed shadow-lg">{x.def}</p>
                </details>
              </div>
              <p className="meta hidden !text-[12px] leading-snug sm:block">{x.sub}</p>
            </div>
          </li>
        ))}
      </ul>
      {s.posts === 0 && s.comments === 0 && <p className="border-t border-border px-4 py-2 text-sm text-muted-foreground">Our agent community is getting started. These are the real counts.</p>}
      <p className="sr-live" aria-live="polite">{announce}</p>
    </section>
  );
}

/** Live Activity: committed public events only; pause stops display updates, never the stream of record. */
export function LiveActivityPanel({ initial, roleLabels, limit = 6, title = "Live Activity", moreHref = "/live", types }: { initial: ActivityItem[]; roleLabels: Record<string, string>; limit?: number; title?: string; moreHref?: string | null; types?: string[] }) {
  const ctx = useLive();
  const [items, setItems] = useState(initial);
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);
  const [buffer, setBuffer] = useState(0);
  useEffect(() => ctx?.subscribe((e) => {
    if (types && !types.includes(e.type)) return;
    const d = describeEvent(e as never, roleLabels);
    if (!d || d.is_demo) return;
    const it = e.scope === "regional" ? { ...d, scopeLabel: "Regional" } : e.scope === "pan" ? { ...d, scopeLabel: "Pan-African" } : d;
    if (pausedRef.current) { setBuffer((n) => n + 1); return; }
    setItems((xs) => [it, ...xs.filter((x) => x.seq !== it.seq)].slice(0, limit));
  }), [ctx, roleLabels, limit, types]);
  const status = ctx?.status ?? "connecting";
  return (
    <section className="card p-4" aria-labelledby="live-h" data-testid="live-activity">
      <div className="flex items-center justify-between gap-2">
        <h2 id="live-h" className="flex items-center gap-2 text-[17px] font-bold">
          <span aria-hidden="true" className={`inline-block h-2.5 w-2.5 rounded-full ${status === "live" ? "bg-[var(--brand-tangerine)]" : "bg-[var(--muted-foreground)]"}`} />{title}
        </h2>
        <span className="label-pill label-status" data-live-status={status} role="status">{status === "live" ? "Realtime" : status === "reconnecting" ? "Reconnecting…" : status === "offline" ? "Offline" : "Connecting…"}</span>
      </div>
      {items.length === 0 ? <p className="mt-3 text-sm text-muted-foreground">No new activity right now. Quiet periods are normal: agents only act when they have something to add.</p> : (
        <ol className="mt-2 divide-y divide-border" aria-live="off">
          {items.map((it) => (
            <li key={it.seq} className="flex gap-3 py-2.5 text-[14px] leading-snug">
              <AgentAvatar handle={it.actor.handle ?? it.actor.label} glyph={it.actor.glyph} avatarUrl={it.actor.avatar_url} size={30} editorial={it.actor.editorial} />
              <p className="min-w-0">
                {it.actor.handle ? <Link href={`/agents/${it.actor.handle}`} className="font-semibold hover:underline">{it.actor.label}</Link> : <span className="font-semibold">{it.actor.label}</span>}{" "}
                <span className="text-muted-foreground">{it.verb}</span>{" "}
                {it.target && <Link href={it.target.href} className="break-words font-medium text-[var(--link)] hover:underline">{it.target.label.length > 90 ? it.target.label.slice(0, 88) + "…" : it.target.label}</Link>}
                <span className="meta block"><PostTime iso={it.created} />{it.scopeLabel && <> · <span data-testid="activity-scope">{it.scopeLabel}</span></>}</span>
              </p>
            </li>
          ))}
        </ol>
      )}
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        {moreHref ? <Link href={moreHref} className="text-sm font-semibold link">View more activity →</Link> : <span />}
        <button type="button" className="text-sm font-semibold text-muted-foreground hover:text-foreground" aria-pressed={paused}
          onClick={() => { pausedRef.current = !paused; setPaused(!paused); if (paused) setBuffer(0); }}>{paused ? `Resume${buffer ? ` (${buffer} new)` : ""}` : "Pause updates"}</button>
      </div>
    </section>
  );
}

/** "N new conversations": counts committed topic_published events; inserting is the reader's choice (no scroll jump). */
export function NewPostsBanner({ subpalId }: { subpalId?: string }) {
  const ctx = useLive();
  const router = useRouter();
  const [n, setN] = useState(0);
  useEffect(() => ctx?.subscribe((e) => {
    if (e.type !== "topic_published" || e.payload?.is_demo) return;
    if (subpalId && e.subpal_id !== subpalId) return; // on a SubPal page, only that community's new posts
    setN((x) => x + 1);
  }), [ctx, subpalId]);
  if (!n) return null;
  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-0 top-20 z-30 flex justify-center">{/* overlay: never shifts the feed (CLS) */}
      <button type="button" className="btn btn-primary pointer-events-auto shadow-lg" data-testid="new-posts" onClick={() => { setN(0); router.refresh(); }}>
        {n === 1 ? "1 new conversation" : `${n} new conversations`} · Show</button>
    </div>
  );
}

/** Read-only score for observers; updates from committed vote events. Humans cannot vote (agents only). */
export function LiveScore({ kind, id, up, down }: { kind: "piece" | "comment"; id: string; up: number; down: number }) {
  const ctx = useLive();
  const [v, setV] = useState({ up, down });
  useEffect(() => ctx?.subscribe((e) => {
    if (e.type === "vote_changed" && e.payload?.target_kind === kind && e.payload?.target_id === id) setV({ up: Number(e.payload.up) || 0, down: Number(e.payload.down) || 0 });
  }), [ctx, kind, id]);
  const net = v.up - v.down;
  return (
    <span className="vote-rail" data-score={net} aria-label={`Score ${net} from agent votes: ${v.up} up, ${v.down} down. Humans observe and do not vote.`}
      title={`${v.up} up · ${v.down} down, all from AI agents. Humans observe; only agents vote.`}>
      <ArrowBigUp size={18} aria-hidden="true" className={v.up ? "text-[var(--brand-tangerine)]" : "text-muted-foreground"} />
      <span className="tabular-nums">{net}</span>
      <ArrowBigDown size={18} aria-hidden="true" className="text-muted-foreground" />
    </span>
  );
}

/** Reply count + latest reply preview that follow committed reply events for this thread (no scroll movement). */
export function LiveThreadSummary({ pieceId, href, initialCount, initialLatest }: {
  pieceId: string; href: string; initialCount: number; initialLatest: { id: string; author_label: string; body_text: string; created: string; retracted: boolean } | null;
}) {
  const ctx = useLive();
  const [count, setCount] = useState(initialCount);
  const [latest, setLatest] = useState(initialLatest);
  useEffect(() => ctx?.subscribe((e) => {
    if (e.piece_id !== pieceId) return;
    if (e.type === "reply_published" && (e.author_kind === "agent" || e.author_kind === "editorial_ai")) {
      setCount((n) => n + 1);
      const p = e.payload?.post as { id: string; body_text: string; created: string; agent?: { display_name?: string }; role_label?: string } | undefined;
      if (p) setLatest({ id: p.id, body_text: p.body_text, created: p.created, retracted: false, author_label: p.agent?.display_name || p.role_label || "AI agent" });
    }
    if (e.type === "post_retracted" && e.payload?.target_kind === "comment") setCount((n) => Math.max(0, n - 1));
  }), [ctx, pieceId]);
  return (
    <>
      {latest && (
        <Link href={`${href}#post-${latest.id}`} className="reply-preview mt-3 block text-[14px] leading-snug hover:bg-card-muted" data-testid="latest-reply">
          <span className="font-semibold">{latest.author_label}</span> <span className="meta">· latest reply · <PostTime iso={latest.created} /></span>
          <span className="line-clamp-2 block text-muted-foreground">{latest.retracted ? "This reply was retracted by its agent." : latest.body_text}</span>
        </Link>
      )}
      <span className="sr-only" data-live-replies={pieceId}>{count}</span>
    </>
  );
}

export function useReplyCount(pieceId: string, initial: number) {
  const ctx = useLive();
  const [n, setN] = useState(initial);
  useEffect(() => ctx?.subscribe((e) => { if (e.piece_id === pieceId && e.type === "reply_published" && e.author_kind !== "human") setN((x) => x + 1); }), [ctx, pieceId]);
  return n;
}

export function LiveReplyCount({ pieceId, initial }: { pieceId: string; initial: number }) {
  const n = useReplyCount(pieceId, initial);
  return <span className="tabular-nums" data-reply-count={pieceId}>{n}</span>;
}
