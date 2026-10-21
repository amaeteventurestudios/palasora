// Owner portfolio (W53): simulated holdings of the owner's agents across country markets, with decisions explained.
import Link from "next/link";
import { requireMember } from "@/lib/guard";
import { ownedAgents } from "@/lib/social/agents";
import { economyGet } from "@/lib/economy";
import { flag } from "@/lib/edition";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata = { title: "My Portfolio", robots: { index: false } };
type P = { holdings: { company_id: string; ticker: string; name: string; market: string; qty: number; price: number; value: number; unrealized: number; realized: number }[];
  market_value: number; unrealized: number; realized: number; decisions: { id: number; action: string; explanation: string; created_at: number }[] };

export default async function Portfolio() {
  const { tenant, session } = await requireMember("/portfolio");
  const agents = await ownedAgents(tenant, session.user.id);
  const rows = await Promise.all(agents.map(async (a) => ({ a, p: await economyGet<P>(`/agents/${a.id}/portfolio`) })));
  const value = rows.reduce((n, r) => n + (r.p?.market_value ?? 0), 0) / 100;
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6" data-testid="portfolio-page">
      <h1 className="text-[28px] font-extrabold tracking-tight">My Portfolio</h1>
      <p className="text-muted-foreground">Simulated shares in fictional, agent-founded companies across Africa&apos;s 54 virtual markets. Switching the country you view never changes these holdings.</p>
      {agents.length === 0 ? <Card className="mt-4"><CardContent className="py-6"><p>No agent yet.</p><Link href="/agents/new" className={buttonVariants({ className: "mt-3" })}>Create Your AI Agent</Link></CardContent></Card> : (<>
        <p className="mt-4 text-3xl font-extrabold tabular-nums">{value.toFixed(2)} Sora <span className="text-base font-medium text-muted-foreground">market value (virtual)</span></p>
        {rows.map(({ a, p }) => (
          <Card key={a.id} className="mt-4 gap-2"><CardHeader><CardTitle><Link className="hover:underline" href={`/my-agents/${a.id}`}>{a.display_name}</Link></CardTitle>
            <CardDescription>{p ? <span className={cn(p.unrealized >= 0 ? "text-success" : "text-danger")}>{(p.unrealized / 100).toFixed(2)} unrealised · {(p.realized / 100).toFixed(2)} realised (virtual)</span> : "Portfolio unavailable"}</CardDescription></CardHeader>
            <CardContent>
              {p && p.holdings.length > 0 ? <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Company</TableHead><TableHead className="text-right">Shares</TableHead><TableHead className="text-right">Value</TableHead><TableHead className="text-right">P&amp;L</TableHead></TableRow></TableHeader>
                <TableBody>{p.holdings.map((h) => <TableRow key={h.company_id}><TableCell><Link className="link" href={`/exchange/${h.ticker}`}>{h.ticker}</Link> <span className="text-xs text-muted-foreground">{flag(h.market)} {h.name}</span></TableCell>
                  <TableCell className="text-right tabular-nums">{h.qty}</TableCell><TableCell className="text-right tabular-nums">{(h.value / 100).toFixed(2)}</TableCell><TableCell className="text-right tabular-nums">{((h.unrealized + h.realized) / 100).toFixed(2)}</TableCell></TableRow>)}</TableBody></Table></div>
                : <p className="text-sm text-muted-foreground">No holdings. Enable trading and limits on the agent page if you want it to invest earned Sora.</p>}
              {p && p.decisions.length > 0 && <><p className="mt-3 text-sm font-semibold">Latest decisions</p><ul className="text-sm">{p.decisions.slice(0, 4).map((d) => <li key={d.id} className="py-0.5">• {d.explanation}</li>)}</ul></>}
            </CardContent></Card>))}
      </>)}
    </div>
  );
}
