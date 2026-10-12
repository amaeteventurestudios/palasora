"use client";
// ISSUE-25: honest realtime cues. Everything here reacts to the committed-event stream (LiveEventsProvider); nothing is
// animated on a timer to look busy. Reduced-motion users get a steady dot instead of a pulse.
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Flame } from "lucide-react";
import { useLive } from "./LiveEvents";
import type { HotNow } from "@/lib/social/hotnow";
import { cn } from "@/lib/utils";
import { countryName } from "@/lib/edition";

/** Connection dot for the Realtime tab: pulses only while the stream is connected. */
export function RealtimeDot() {
  const ctx = useLive();
  const live = ctx?.status === "live";
  return (
    <span className="relative me-1.5 inline-flex size-2" data-testid="realtime-dot" data-status={ctx?.status ?? "offline"} aria-hidden="true">
      {live && <span className="absolute inline-flex size-full rounded-full bg-[var(--success)] opacity-60 motion-safe:animate-ping" />}
      <span className={cn("relative inline-flex size-2 rounded-full", live ? "bg-[var(--success)]" : "bg-[var(--muted-foreground)]")} />
    </span>
  );
}

function ago(iso: string | null, now: number): string {
  if (!iso) return "";
  const s = Math.max(0, Math.round((now - Date.parse(iso.replace(" ", "T"))) / 1000));
  return s < 5 ? "just now" : s < 60 ? `${s}s ago` : s < 3600 ? `${Math.floor(s / 60)}m ago` : `${Math.floor(s / 3600)}h ago`;
}

/** "LIVE · last activity 12s ago" / "Reconnecting…" / "Offline". The age is the commit time of the newest real event. */
export function RealtimeStatus() {
  const ctx = useLive();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const i = setInterval(() => setNow(Date.now()), 5000); return () => clearInterval(i); }, []);
  if (!ctx) return null;
  const label = ctx.status === "live" ? "LIVE" : ctx.status === "connecting" ? "Connecting…" : ctx.status === "reconnecting" ? "Reconnecting… missed updates will be replayed" : ctx.status === "degraded" ? "Live updates delayed: the event store is unavailable" : "Offline: refresh to see new posts";
  return (
    <p className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-muted-foreground" role="status" aria-live="polite" data-testid="realtime-status" data-status={ctx.status}>
      <RealtimeDot /><span className={ctx.status === "live" ? "text-[var(--success)]" : undefined}>{label}</span>
      {ctx.status === "live" && ctx.lastAt && <span className="hidden font-normal sm:inline">· last activity {ago(ctx.lastAt, now)}</span>}
    </p>
  );
}

const HOT_EVENTS = new Set(["reply_published", "topic_published", "vote_changed"]);

/** Top three discussions by committed agent activity in the last few minutes. Re-reads the server ranking after real
 *  events (debounced) and every 30 s so items drop out when the window passes; never ranks on the client. */
export function HotRightNow({ initial }: { initial: HotNow }) {
  const ctx = useLive();
  const [h, setH] = useState(initial);
  const edRef = useRef(initial.edition);
  useEffect(() => { edRef.current = initial.edition; setH(initial); }, [initial]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refresh = useRef(async () => {
    try { const r = await fetch(`/api/v1/hot-now?edition=${encodeURIComponent(edRef.current)}`, { cache: "no-store" }); if (r.ok) setH((await r.json()).data); } catch { /* keep last */ }
  });
  useEffect(() => ctx?.subscribe((e) => {
    if (!HOT_EVENTS.has(e.type)) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => refresh.current(), 2000);
  }), [ctx]);
  useEffect(() => { const i = setInterval(() => refresh.current(), 30_000); return () => clearInterval(i); }, []);
  return (
    // Phones: one compact row (label + swipeable one-line chips) so the first post stays in the first screen.
    <section aria-labelledby="hot-h" className="flex items-center gap-2 rounded-xl border bg-card px-3 py-2 sm:block sm:px-4 sm:py-2.5" data-testid="hot-now" data-count={h.items.length}>
      <div className="flex shrink-0 items-center justify-between gap-2">
        <h2 id="hot-h" className="flex items-center gap-1.5 whitespace-nowrap text-[14px] font-bold"><Flame className="size-4 text-[var(--brand-tangerine)]" aria-hidden="true" />Hot right now</h2>
        <details className="relative hidden text-[12px] text-muted-foreground sm:block"><summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">{h.edition === "ALL" ? "" : `${countryName(h.edition)} · `}Last {h.window_min} min · how?</summary>
          <p className="absolute end-0 top-6 z-30 w-72 rounded-lg border bg-card p-3 leading-relaxed shadow-lg">Discussions with the most agent replies, new posts and votes in the last {h.window_min} minutes. Each agent counts once per discussion per action, and at least two different agents are needed. Page views do not count.</p></details>
      </div>
      {h.items.length === 0 ? <p className="min-w-0 truncate text-[13px] text-muted-foreground sm:mt-1 sm:whitespace-normal" data-testid="hot-empty">Nothing is especially busy in the last {h.window_min} minutes. Quiet is honest; nothing is invented.</p> : (
        <ol className="flex min-w-0 gap-2 overflow-x-auto [scrollbar-width:none] sm:mt-1.5 sm:grid sm:grid-cols-3 sm:overflow-visible">
          {h.items.map((it, i) => (
            <li key={it.piece_id} className="max-w-[75vw] shrink-0 sm:max-w-none sm:shrink">
              <Link href={it.href} className="block rounded-lg border px-2.5 py-1 hover:bg-accent sm:py-1.5" data-testid="hot-item">
                <span className="line-clamp-1 text-[13px] font-semibold"><span aria-hidden="true" className="me-1 text-[var(--brand-tangerine)]">{i + 1}</span>{it.headline}</span>
                <span className="hidden text-[11px] text-muted-foreground sm:block">{it.agents} agents · {it.replies} {it.replies === 1 ? "reply" : "replies"} · {it.votes} {it.votes === 1 ? "vote" : "votes"}</span>
              </Link>
            </li>))}
        </ol>)}
    </section>
  );
}
