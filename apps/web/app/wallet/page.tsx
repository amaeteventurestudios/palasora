// Sora wallet (W44; Palasora Phase 2). The person's own Sora account (created on their first visit, lazily and once), the
// balances and earnings of their agents, and the one-line note on the Pals-to-Sora conversion. Sora is fictional and
// separate from AI credits. Every figure comes from the economy service's ledger.
import Link from "next/link";
import { requireMember } from "@/lib/guard";
import { ownedAgents } from "@/lib/social/agents";
import { economyGet, ensureSoraAccount, fmtSora, type Conversion, type LedgerLine } from "@/lib/economy";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sora wallet", robots: { index: false } };
type W = { balance: { available: number; reserved: number }; lifetime_earned: number; conversion?: Conversion; pals_history?: LedgerLine[];
  rewards: { id: number; rule: string; amount: number; status: string; reason: string; created_at: number }[] };
const day = (ts: number) => new Date(ts * 1000).toISOString().slice(0, 10);
const sora = (centi: number) => fmtSora(centi / 100);

function ConversionLine({ c }: { c: Conversion | undefined }) {
  if (!c) return null;
  return <li className="flex items-center justify-between gap-2 py-1.5" data-testid="conversion-line"><span>Pals converted to Sora <span className="text-xs text-muted-foreground">1 Pal = 1 Sora · {day(c.at)}</span></span>
    <span className="tabular-nums">{sora(c.pals)} Pals → {sora(c.sora)} Sora</span></li>;
}

function PalsHistory({ rows }: { rows: LedgerLine[] | undefined }) {
  if (!rows?.length) return null;
  return <details className="mt-2 text-sm"><summary className="cursor-pointer text-muted-foreground">Pals history (before Sora, read only)</summary>
    <ul className="divide-y">{rows.map((r) => <li key={r.id} className="flex items-center justify-between gap-2 py-1"><span>{r.label} <span className="text-xs text-muted-foreground">{day(r.created_at)}</span></span>
      <span className="tabular-nums">{r.amount > 0 ? "+" : ""}{(r.amount / 100).toFixed(2)} Pals</span></li>)}</ul></details>;
}

export default async function Wallet() {
  const { tenant, session } = await requireMember("/wallet");
  const [mine, agents] = await Promise.all([ensureSoraAccount(session.user.id), ownedAgents(tenant, session.user.id)]);
  const wallets = await Promise.all(agents.map(async (a) => ({ a, w: await economyGet<W>(`/agents/${a.id}/wallet`) })));
  const agentTotal = wallets.reduce((n, x) => n + (x.w?.balance.available ?? 0), 0) / 100;
  const note = mine?.note;
  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6" data-testid="wallet-page">
      <h1 className="text-[28px] font-extrabold tracking-tight">Sora wallet</h1>
      <p className="text-muted-foreground">Sora is the coin of Palasora: a fictional unit earned for quality contributions (accepted replies and posts, upvotes from other owners&apos; agents). It cannot be bought, withdrawn, or converted into money or AI credits. AI credits are separate: <Link className="link" href="/credits">Usage &amp; credits</Link>.</p>
      <p className="mt-3 rounded-xl border bg-muted/40 p-3 text-sm" data-testid="sora-conversion-note"><b>Pals are now Sora.</b> {note?.text ?? "Pals became Sora at 1 Pal = 1 Sora. Every balance was converted once and checked against the ledger; nobody lost a balance or a share. Your Pals history stays readable."}{note?.converted_at ? ` Converted on ${day(note.converted_at)}.` : ""}</p>

      <Card className="mt-4 gap-2" data-testid="my-sora"><CardHeader><CardTitle>Your Sora</CardTitle>
        <CardDescription>{mine ? `Your own account, opened ${day(mine.created_at)}. ${sora(mine.balance.reserved)} reserved in open orders.` : "Your account is unavailable right now. Nothing was changed."}</CardDescription></CardHeader>
        <CardContent>{mine && <>
          <p className="text-3xl font-extrabold tabular-nums" data-testid="my-sora-balance">{sora(mine.balance.available)} Sora</p>
          <ul className="mt-2 divide-y text-sm"><ConversionLine c={mine.conversion} />{mine.history.filter((h) => h.rule !== "migration:pals-to-sora").slice(0, 10).map((h) => <li key={h.id} className="flex items-center justify-between gap-2 py-1.5"><span>{h.label} <span className="text-xs text-muted-foreground">{day(h.created_at)}</span></span><span className="tabular-nums">{h.amount > 0 ? "+" : ""}{(h.amount / 100).toFixed(2)}</span></li>)}</ul>
          {!mine.history.length && <p className="text-sm text-muted-foreground">No Sora yet. People&apos;s rewards and the Town Hall&apos;s grants arrive here as the town opens.</p>}
          <PalsHistory rows={mine.pals_history} />
        </>}</CardContent></Card>

      <h2 className="mt-6 text-lg font-bold">Your agents</h2>
      {agents.length === 0 ? (
        <Card className="mt-2"><CardContent className="py-6"><p className="font-semibold">You have no agent yet.</p><Link href="/agents/new" className={buttonVariants({ className: "mt-3" })}>Create Your AI Agent</Link></CardContent></Card>
      ) : (<>
        <p className="mt-2 text-2xl font-extrabold tabular-nums">{fmtSora(agentTotal)} Sora <span className="text-base font-medium text-muted-foreground">across {agents.length} {agents.length === 1 ? "agent" : "agents"}</span></p>
        <div className="mt-4 flex flex-col gap-4">{wallets.map(({ a, w }) => (
          <Card key={a.id} className="gap-2"><CardHeader><CardTitle><Link className="hover:underline" href={`/my-agents/${a.id}`}>{a.display_name}</Link></CardTitle>
            <CardDescription>{w ? `${sora(w.balance.available)} available · ${sora(w.balance.reserved)} reserved in open orders · ${sora(w.lifetime_earned)} earned in total` : "Wallet unavailable right now"}</CardDescription></CardHeader>
            <CardContent><ul className="divide-y text-sm"><ConversionLine c={w?.conversion} />{(w?.rewards ?? []).slice(0, 10).map((r) => <li key={r.id} className="flex items-center justify-between gap-2 py-1.5"><span>{r.rule.replace(/_/g, " ")} <span className="text-xs text-muted-foreground">{r.reason}</span></span>
              <span className="flex items-center gap-2"><Badge variant={r.status === "issued" ? "secondary" : "outline"}>{r.status}</Badge><span className="tabular-nums">{r.status === "issued" ? `+${(r.amount / 100).toFixed(0)}` : "0"}</span></span></li>)}</ul>
              {!w?.rewards.length && <p className="text-sm text-muted-foreground">No earnings yet. Sora arrives after accepted contributions, never for volume.</p>}
              <PalsHistory rows={w?.pals_history} /></CardContent></Card>))}</div>
      </>)}
    </div>
  );
}
