"use client";
// Your path: the ladder from newcomer to company owner. Each rung is read from the town's records (a home, a way to earn,
// a business, a first worker, trade, a bigger business, shares on the Exchange); the next one has a button to where it's done.
import { useEffect, useState } from "react";
import Link from "next/link";
import { Check } from "lucide-react";
import { loadPlace } from "@/app/actions/town-place";
import type { PathStep, PlaceData } from "@/lib/world/place";

export type PathGo = "place" | "jobs" | "market" | "exchange";
const GO: Record<PathStep["key"], { go: PathGo; label: string }> = {
  home: { go: "place", label: "Find a home" }, earn: { go: "jobs", label: "See the job board" }, business: { go: "place", label: "Find a plot" },
  staff: { go: "jobs", label: "Post a job" }, trade: { go: "market", label: "Go to the Market Hall" }, bigger: { go: "place", label: "Find a plot" },
  listed: { go: "exchange", label: "Open the Town Exchange" },
};
const btn = "inline-flex min-h-11 items-center justify-center rounded-full px-4 text-sm font-semibold";

export function PathPanel({ onGo }: { onGo(where: PathGo): void }) {
  const [d, setD] = useState<{ signedIn: boolean; data: PlaceData | null } | undefined>();
  useEffect(() => { loadPlace().then(setD).catch(() => setD({ signedIn: false, data: null })); }, []);
  if (d === undefined) return <p className="text-sm text-[#4b5566]" data-testid="path-loading">Reading your story so far…</p>;
  if (!d.signedIn) return <div className="text-sm" data-testid="path-sign-in"><p>From a free home to a company on the Town Exchange: sign in to start your path.</p>
    <div className="mt-3"><Link className={`${btn} bg-[#1d2433] text-white`} href="/auth/sign-in?next=/">Sign in</Link></div></div>;
  const p = d.data?.path;
  if (!p) return <p className="text-sm text-[#4b5566]">The town is unreachable right now.</p>;
  return (
    <div className="flex flex-col gap-3 text-sm" data-testid="path">
      <p className="text-[#4b5566]" data-testid="path-summary">{p.done === p.total ? "Every step done: you run a listed company." : `${p.done} of ${p.total} steps done.`}</p>
      <ol className="flex flex-col gap-1.5">{p.steps.map((s, i) => {
        const next = s.key === p.next;
        return <li key={s.key} data-testid="path-step" data-step={s.key} data-done={s.done ? "yes" : "no"}
          className={`flex gap-3 rounded-xl p-2.5 ${next ? "border border-[#d8a838]/60 bg-[#fffaf0]" : ""}`}>
          <span className={`mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${s.done ? "bg-[#3f8f5a] text-white" : next ? "bg-[#d8a838] text-white" : "bg-black/[0.07] text-[#4b5566]"}`} aria-hidden>
            {s.done ? <Check className="size-3.5" /> : i + 1}</span>
          <span className="flex-1"><span className={`block font-semibold ${s.done ? "text-[#4b5566]" : ""}`}>{s.title}{s.done ? <span className="sr-only"> (done)</span> : null}</span>
            {!s.done && <span className="block text-xs text-[#4b5566]">{s.how}</span>}
            {next && <button type="button" className={`${btn} mt-2 bg-[#1d2433] text-white`} onClick={() => onGo(GO[s.key].go)} data-testid="path-go">{GO[s.key].label}</button>}</span>
        </li>;
      })}</ol>
      <p className="text-xs text-[#4b5566]">Every step happens in the town itself: what you own, who works for you and what you trade are read from its records.</p>
    </div>
  );
}
