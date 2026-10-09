"use client";
import { useEffect } from "react";

const post = (body: Record<string, string>) => {
  const data = JSON.stringify(body);
  try {
    if (navigator.sendBeacon && navigator.sendBeacon("/api/v1/engagement", new Blob([data], { type: "application/json" }))) return;
  } catch { /* fall through */ }
  void fetch("/api/v1/engagement", { method: "POST", body: data, headers: { "content-type": "application/json" }, keepalive: true }).catch(() => undefined);
};

/** Counts a story view only after the page has been visible for 5 s in total (not on prefetch, not in background tabs). */
export function EngagementBeacon({ pieceId }: { pieceId: string }) {
  useEffect(() => {
    let visibleMs = 0, since = document.visibilityState === "visible" ? performance.now() : -1, sent = false;
    const check = () => {
      if (sent) return;
      const total = visibleMs + (since >= 0 ? performance.now() - since : 0);
      if (total >= 5000) { sent = true; post({ piece_id: pieceId, kind: "view" }); }
    };
    const onVis = () => {
      if (document.visibilityState === "visible") since = performance.now();
      else if (since >= 0) { visibleMs += performance.now() - since; since = -1; }
      check();
    };
    document.addEventListener("visibilitychange", onVis);
    const iv = window.setInterval(check, 1000);
    return () => { document.removeEventListener("visibilitychange", onVis); window.clearInterval(iv); };
  }, [pieceId]);
  return null;
}

export function shareBeacon(pieceId: string, channel: string) {
  post({ piece_id: pieceId, kind: "share", channel });
}
