"use client";
import { useT } from "@/lib/i18n/client";
// One EventSource per page. Events are committed rows from thread_events, delivered in seq order.
// Reconnects use Last-Event-ID (browser default) so missed events are replayed; duplicates are
// dropped by seq. No synthetic activity is ever created client-side.
import { createContext, useContext, useEffect, useRef, useState } from "react";

export type LiveEvent = { seq: number; type: string; piece_id: string; post_id: string; parent_id: string; author_kind: string; role_id: string; created: string; payload: Record<string, any> };
type Status = "connecting" | "live" | "reconnecting" | "offline";
type Ctx = { status: Status; subscribe: (fn: (e: LiveEvent) => void) => () => void; lastSeq: number };
const LiveCtx = createContext<Ctx | null>(null);

export function LiveEventsProvider({ children, cursor, piece }: { children: React.ReactNode; cursor: number; piece?: string }) {
  const [status, setStatus] = useState<Status>("connecting");
  const [lastSeq, setLastSeq] = useState(cursor);
  const subs = useRef(new Set<(e: LiveEvent) => void>());
  const seen = useRef(cursor);
  useEffect(() => {
    if (typeof EventSource === "undefined") { setStatus("offline"); return; }
    const url = `/api/v1/events?cursor=${cursor}${piece ? `&piece=${piece}` : ""}`;
    const es = new EventSource(url);
    const handle = (msg: MessageEvent) => {
      try {
        const e = JSON.parse(msg.data) as LiveEvent;
        if (e.seq <= seen.current) return; // replay overlap after reconnect
        seen.current = e.seq;
        setLastSeq(e.seq);
        subs.current.forEach((fn) => fn(e));
      } catch { /* malformed: ignore */ }
    };
    for (const t of ["topic_published", "reply_published", "post_corrected", "post_removed", "thread_paused", "thread_resumed"]) es.addEventListener(t, handle as EventListener);
    es.onopen = () => setStatus("live");
    es.onerror = () => setStatus(navigator.onLine === false ? "offline" : "reconnecting");
    return () => es.close();
  }, [cursor, piece]);
  return <LiveCtx.Provider value={{ status, lastSeq, subscribe: (fn) => { subs.current.add(fn); return () => { subs.current.delete(fn); }; } }}>{children}</LiveCtx.Provider>;
}

export function useLive() { return useContext(LiveCtx); }

export function LiveStatus() {
  const ctx = useLive();
  const t = useT();
  if (!ctx) return null;
  const label = { connecting: t("live.connecting"), live: t("live.on"), reconnecting: t("live.reconnecting"), offline: t("live.offline") }[ctx.status];
  return (
    <p className="meta inline-flex items-center gap-2" role="status" aria-live="polite" data-live-status={ctx.status}>
      <span aria-hidden="true" className={`inline-block h-2 w-2 rounded-full ${ctx.status === "live" ? "bg-success motion-safe:animate-pulse" : "bg-[var(--muted-foreground)]"}`} />{label}
    </p>
  );
}

/** Counter that starts from the server value and increments only on matching committed events. */
export function LiveCount({ pieceId, initial, kind, one, many }: { pieceId: string; initial: number; kind: "ai" | "human"; one: string; many: string }) {
  const ctx = useLive();
  const [n, setN] = useState(initial);
  useEffect(() => ctx?.subscribe((e) => {
    if (e.type === "reply_published" && e.piece_id === pieceId && ((kind === "ai" && e.author_kind === "editorial_ai") || (kind === "human" && e.author_kind === "human"))) setN((x) => x + 1);
  }), [ctx, pieceId, kind]);
  return <span data-live-count={`${kind}:${pieceId}`}>{n} {n === 1 ? one : many}</span>;
}
