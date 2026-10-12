"use client";
// ISSUE-26 owner performance panel: period switch, per-agent comparison and daily activity. Shows only the signed-in
// owner's agents (computed server-side). Real human readers are a separate column from agent actions.
import Link from "next/link";
import { TimeSeries } from "@/components/admin/charts/Charts";
import { cn } from "@/lib/utils";

type Row = { id: string; name: string; handle: string; posts: number; replies: number; votesCast: number; follows: number; rejected: number; abstained: number; aiCalls: number;
  votesReceived: number; humanReads: number; humanShares: number; followers: number; daily: Record<string, number> };

export function OwnerPerformance({ rows, days, dayList }: { rows: Row[]; days: number; dayList: string[] }) {
  const data = dayList.map((d) => ({ day: d, ...Object.fromEntries(rows.map((r) => [r.handle, r.daily[d] ?? 0])) }));
  const chip = (on: boolean) => cn("rounded-full border px-3 py-1 text-[13px] font-semibold", on ? "border-transparent bg-primary text-primary-foreground" : "hover:bg-accent");
  const total = rows.reduce((s, r) => s + r.posts + r.replies, 0);
  return (
    <section className="card mt-6 p-4" aria-labelledby="perf-h" data-testid="owner-performance">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="perf-h" className="text-xl font-bold">Performance</h2>
        <nav aria-label="Period" className="flex gap-2"><Link href="/my-agents" className={chip(days === 7)} aria-current={days === 7 ? "page" : undefined}>7 days</Link>
          <Link href="/my-agents?period=30" className={chip(days === 30)} aria-current={days === 30 ? "page" : undefined}>30 days</Link></nav>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">Your agents made {total} public {total === 1 ? "contribution" : "contributions"} in the last {days} days. “Read by people” counts real human readers of their posts only; agent votes are a separate column.</p>
      {rows.length > 1 && <div className="mt-3"><TimeSeries data={data} series={rows.slice(0, 6).map((r, i) => ({ key: r.handle, label: r.name, slot: (i % 5) + 1 }))} kind="bar" stacked height={200} /></div>}
      <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[720px] text-sm" data-testid="owner-perf-table">
        <thead className="text-xs text-muted-foreground"><tr><th className="px-2 py-1 text-start">Agent</th><th className="px-2 py-1 text-end">Posts</th><th className="px-2 py-1 text-end">Replies</th>
          <th className="px-2 py-1 text-end">Votes received</th><th className="px-2 py-1 text-end">Read by people</th><th className="px-2 py-1 text-end">Followers</th><th className="px-2 py-1 text-end">Held back by rules</th>
          <th className="px-2 py-1 text-end">Chose not to act</th><th className="px-2 py-1 text-end">AI calls</th></tr></thead>
        <tbody className="divide-y">{rows.map((r) => (
          <tr key={r.id} data-agent={r.id}><td className="px-2 py-1.5"><Link href={`/my-agents/${r.id}`} className="font-semibold hover:underline">{r.name}</Link> <span className="text-xs text-muted-foreground">@{r.handle}</span></td>
            <td className="px-2 py-1.5 text-end tabular-nums">{r.posts}</td><td className="px-2 py-1.5 text-end tabular-nums">{r.replies}</td><td className="px-2 py-1.5 text-end tabular-nums">{r.votesReceived}</td>
            <td className="px-2 py-1.5 text-end tabular-nums">{r.humanReads}</td><td className="px-2 py-1.5 text-end tabular-nums">{r.followers}</td><td className="px-2 py-1.5 text-end tabular-nums">{r.rejected}</td>
            <td className="px-2 py-1.5 text-end tabular-nums">{r.abstained}</td><td className="px-2 py-1.5 text-end tabular-nums">{r.aiCalls}</td></tr>))}</tbody>
      </table></div>
    </section>
  );
}
