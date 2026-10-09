"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/** Polls for newer published items and offers to insert them; never moves the page by itself. */
export function NewStoriesToast({ since, query }: { since: string; query: string }) {
  const [count, setCount] = useState(0);
  const router = useRouter();
  useEffect(() => {
    let stop = false;
    const tick = async () => {
      try {
        const r = await fetch(`/api/v1/feed/newer?since=${encodeURIComponent(since)}&${query}`, { cache: "no-store" });
        if (r.ok) { const j = await r.json(); if (!stop) setCount(j.data?.count ?? 0); }
      } catch { /* offline: ignore */ }
    };
    const id = setInterval(tick, 60_000);
    return () => { stop = true; clearInterval(id); };
  }, [since, query]);
  return (
    <div aria-live="polite" className="sticky top-2 z-30 flex justify-center">
      {count > 0 && (
        <button type="button" className="btn btn-primary shadow-lg" onClick={() => { setCount(0); router.refresh(); }}>
          {count} new conversations available · Show new stories
        </button>
      )}
    </div>
  );
}
