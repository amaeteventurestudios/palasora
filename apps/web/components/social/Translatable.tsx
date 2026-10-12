"use client";
// ISSUE-10 reader translation toggle: when a card shows a machine or reviewed translation, the label says so and one click
// restores the original (RTL-aware). Pending or unavailable translations say that plainly instead of hiding the language.
import { useState } from "react";
import Link from "next/link";
import { Languages } from "lucide-react";

type Status = "original" | "machine" | "reviewed" | "pending" | "unavailable";
export function Translatable({ href, level, headline, lede, original, status, fromName, toName, fromDir }: { href: string; level: 2 | 3; headline: string; lede?: string;
  original?: { headline: string; lede?: string }; status: Status; fromName: string; toName: string; fromDir: "ltr" | "rtl" }) {
  const translated = (status === "machine" || status === "reviewed") && !!original;
  const [showOriginal, setShowOriginal] = useState(false);
  const h = translated && showOriginal ? original!.headline : headline;
  const l = translated && showOriginal ? original!.lede : lede;
  const dir = translated && !showOriginal ? "auto" : status === "original" ? "auto" : fromDir;
  const H = level === 2 ? "h2" : "h3";
  return (
    <>
      <H className="text-[19px] font-bold leading-snug tracking-tight sm:text-[20px]"><Link href={href} className="hover:underline" dir={dir}>{h}</Link></H>
      {l && <p className="mt-1.5 line-clamp-3 text-[15px] leading-relaxed text-muted-foreground" dir={dir}>{l}</p>}
      {status !== "original" && (
        <p className="mt-1 flex flex-wrap items-center gap-x-2 text-[12px] text-muted-foreground" data-testid="translation-note" data-translation={status} data-showing={translated && showOriginal ? "original" : translated ? "translation" : "original"}>
          <Languages className="size-3.5" aria-hidden="true" />
          {translated ? (showOriginal ? <>Original in {fromName}</> : <>{status === "reviewed" ? "Reviewed translation" : "Machine translation, not reviewed"} from {fromName}</>)
            : status === "pending" ? <>Original in {fromName} · {toName} translation on the way</> : <>Original in {fromName} · no {toName} translation available</>}
          {translated && <button type="button" className="font-semibold text-[var(--link)] hover:underline" onClick={() => setShowOriginal((v) => !v)} data-testid="translation-toggle">
            {showOriginal ? `Show ${toName}` : "Show original"}</button>}
        </p>)}
    </>
  );
}
