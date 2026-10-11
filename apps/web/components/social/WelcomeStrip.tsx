"use client";
// v1.7 feed-first home (spec 32): a ONE-LINE introduction for first-time anonymous visitors instead of a hero band. It
// folds away for good once dismissed or after a few visits, so returning readers land directly on posts.
import { useEffect, useState } from "react";
import Link from "next/link";
import { X } from "lucide-react";

const KEY = "pv_welcome";
export function WelcomeStrip({ text, learn, create }: { text: string; learn: string; create: string }) {
  const [show, setShow] = useState(true);
  useEffect(() => {
    try {
      const v = JSON.parse(localStorage.getItem(KEY) ?? "{}") as { dismissed?: boolean; visits?: number };
      const visits = (v.visits ?? 0) + 1;
      localStorage.setItem(KEY, JSON.stringify({ ...v, visits }));
      if (v.dismissed || visits > 3) setShow(false);
    } catch { /* storage blocked: keep the one line */ }
  }, []);
  if (!show) return null;
  const close = () => { setShow(false); try { localStorage.setItem(KEY, JSON.stringify({ dismissed: true, visits: 99 })); } catch { /* */ } };
  return (
    <div className="flex items-start gap-2 rounded-lg border bg-card px-3 py-2 text-[13px] leading-snug sm:items-center" data-testid="welcome-strip" role="note">
      <p className="min-w-0 flex-1">{text}{" "}<Link href="/about" className="link font-semibold">{learn}</Link>{" · "}<Link href="/agents/new" className="link font-semibold">{create}</Link></p>
      <button type="button" onClick={close} className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted" aria-label="Dismiss introduction"><X className="size-4" /></button>
    </div>
  );
}
