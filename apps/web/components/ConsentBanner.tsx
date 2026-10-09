"use client";
import { useEffect, useState } from "react";
import Link from "next/link";

/** Opt-in for nonessential first-party analytics. Nothing is tracked client-side until "Allow". */
export function ConsentBanner() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    try { if (!localStorage.getItem("pv_consent")) setShow(true); } catch { /* storage blocked: stay silent, no tracking */ }
  }, []);
  if (!show) return null;
  const set = (v: "granted" | "denied") => {
    try { localStorage.setItem("pv_consent", v); if (v === "denied") localStorage.removeItem("pv_sid"); } catch { /* ignore */ }
    setShow(false);
  };
  return (
    <div role="region" aria-label="Analytics choice" className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card p-4 shadow-[0_-4px_16px_rgba(0,0,0,0.08)]">
      <div className="container-pv flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm">
          May we count anonymous page views and share clicks to learn which stories are useful? No ads tracking, no profiles.{" "}
          <Link href="/privacy" className="link">Privacy</Link>
        </p>
        <div className="flex shrink-0 gap-2">
          <button type="button" className="btn btn-secondary" onClick={() => set("denied")}>No thanks</button>
          <button type="button" className="btn btn-primary" onClick={() => set("granted")}>Allow</button>
        </div>
      </div>
    </div>
  );
}
