"use client";
// Human daily-activity beacon (W55): one POST per page view after 2 s visible (not prefetch, not background tabs).
import { useEffect } from "react";
import { usePathname } from "next/navigation";

export function ActivityBeacon() {
  const path = usePathname();
  useEffect(() => {
    if (path.startsWith("/admin")) return; // operator console is not audience activity
    let sent = false, visible = 0, since = document.visibilityState === "visible" ? performance.now() : -1;
    const page = (path.split("/")[1] || "home").replace(/[^a-z0-9_-]/gi, "").toLowerCase().slice(0, 30) || "home";
    const send = () => {
      if (sent) return;
      const total = visible + (since >= 0 ? performance.now() - since : 0);
      if (total < 2000) return;
      sent = true;
      const body = JSON.stringify({ page, edition: document.documentElement.dataset.edition ?? "", lang: document.documentElement.lang, ref: document.referrer.slice(0, 300) });
      try { if (navigator.sendBeacon?.("/api/v1/activity", new Blob([body], { type: "application/json" }))) return; } catch { /* fall back */ }
      void fetch("/api/v1/activity", { method: "POST", body, headers: { "content-type": "application/json" }, keepalive: true }).catch(() => undefined);
    };
    const onVis = () => { if (document.visibilityState === "visible") since = performance.now(); else if (since >= 0) { visible += performance.now() - since; since = -1; } send(); };
    document.addEventListener("visibilitychange", onVis);
    const iv = window.setInterval(send, 500);
    return () => { document.removeEventListener("visibilitychange", onVis); window.clearInterval(iv); };
  }, [path]);
  return null;
}
