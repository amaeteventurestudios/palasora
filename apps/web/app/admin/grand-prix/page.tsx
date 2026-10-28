// Agent Grand Prix in the Command Center: who signed up, who holds the Anti-Bot Pass, and the weekly Sora prizes paid.
// The game runs on this same server: sign-ups and passes come from its accounts service over a local-only route,
// prizes from the economy's own journal. Read-only; refunds and cancellations happen in Stripe.
import { requirePerm } from "@/lib/guard";
import { economyGet } from "@/lib/economy";
import { AdminPage } from "@/components/admin/AdminPage";
import { HelpTip } from "@/components/admin/HelpTip";
import { MetricCard } from "@/components/admin/charts/Panels";

export const metadata = { title: "Agent Grand Prix" };
export const dynamic = "force-dynamic";

const AGP = (process.env.AGP_ACCOUNTS_URL || "http://127.0.0.1:8141").replace(/\/$/, "");
type Player = { id?: string; email?: string; name?: string; display_name?: string; handle?: string; via?: string; joined?: string; created?: string };
type Pass = { id: string; until: number; since?: number; renews?: boolean; plan?: string; paid?: number; active: boolean };
type Payout = { week?: string | number; amount: number; user_id?: string; memo?: string; created_at?: string | number };

async function local<T>(path: string): Promise<T | null> {
  try { const r = await fetch(AGP + path, { cache: "no-store", signal: AbortSignal.timeout(4000) }); return r.ok ? ((await r.json()) as T) : null; } catch { return null; }
}
const day = (t?: number | string) => { if (!t) return ""; const d = new Date(typeof t === "number" && t < 1e12 ? t * 1000 : t); return isNaN(+d) ? String(t) : d.toISOString().slice(0, 10); };
const usd = (c: number) => `$${(c / 100).toFixed(2)}`;

export default async function AdminGrandPrix() {
  await requirePerm("games", "view");
  const [pl, ps, pz] = await Promise.all([local<{ players: Player[] }>("/agent/players"), local<{ passes: Pass[] }>("/agent/passes"),
    economyGet<{ pot: number; payouts: Payout[] }>("/prizes/agp")]);
  const players = pl?.players ?? [], passes = (ps?.passes ?? []).sort((a, b) => b.until - a.until), payouts = pz?.payouts ?? [];
  const byId = Object.fromEntries(players.filter((p) => p.id).map((p) => [p.id!, p]));
  const who = (id: string) => { const p = byId[id]; return p ? `${p.name || p.display_name || ""}${p.handle ? ` @${p.handle}` : ""}` || id : id; };
  const active = passes.filter((p) => p.active), renewing = active.filter((p) => p.renews);
  const revenue = passes.reduce((s, p) => s + (p.paid || 0), 0), soraPaid = payouts.reduce((s, p) => s + (p.amount || 0), 0);
  const week = new Date(Date.now() - 7 * 864e5).toISOString();
  const off = [!pl && "sign-ups", !ps && "passes", !pz && "prizes"].filter(Boolean);
  return (
    <AdminPage title="Agent Grand Prix" narrative={`${players.length.toLocaleString("en")} signed-up players, ${active.length} active Anti-Bot Passes (${renewing.length} renewing), ${soraPaid.toLocaleString("en")} Sora paid in weekly prizes.`}
      actions={<HelpTip label="Agent Grand Prix" what="The racing game at agentgrandprix.com. Players sign in to race; the Anti-Bot Pass is a Stripe subscription that unlocks every mode and the weekly Sora prizes."
        why="One place to see the game's sign-ups, paying players and prizes next to the rest of the platform." todo="Refunds, cancellations and receipts are handled in the Stripe dashboard. The sign-up list with emails is also on the game's owner screen as a CSV." />}>
      {off.length > 0 && <p role="alert" className="rounded-lg border p-3 text-sm">Not reachable right now: {off.join(", ")}. The game's services may be restarting.</p>}
      <section className="kpi-grid">
        <MetricCard label="Signed-up players" value={players.length.toLocaleString("en")} definition="Accounts made from Agent Grand Prix (Google or email code)." source="game accounts /agent/players" />
        <MetricCard label="New this week" value={String(players.filter((p) => String(p.joined || p.created || "") >= week).length)} definition="Sign-ups in the last seven days." source="game accounts" slot={2} />
        <MetricCard label="Active passes" value={`${active.length} (${renewing.length} renewing)`} definition="Anti-Bot Pass holders whose paid period hasn't ended. Renewing means Stripe will charge again." source="game passes /agent/passes" slot={3} />
        <MetricCard label="Pass revenue to date" value={usd(revenue)} definition="Every paid pass invoice recorded from Stripe's webhooks, before Stripe's fees." source="game passes" slot={4} />
        <MetricCard label="Weekly pot" value={`${(pz?.pot ?? 0).toLocaleString("en")} Sora`} definition="Shared each week by the top ten people on the Daily league (AGP_WEEKLY_POT switch overrides it)." source="economy /prizes/agp" slot={5} />
        <MetricCard label="Sora paid in prizes" value={soraPaid.toLocaleString("en")} definition="All weekly prize payouts so far. Sora is earned only and can't be cashed out." source="economy journal" slot={6} />
      </section>
      <section className="rounded-xl border p-4"><h2 className="font-bold">Anti-Bot Pass holders ({passes.length})</h2>
        {passes.length === 0 ? <p className="text-sm text-muted-foreground">No passes yet.</p> :
          <div className="overflow-x-auto"><table className="mt-2 w-full text-sm"><thead><tr className="text-left text-muted-foreground"><th className="py-1">Player</th><th>Plan</th><th>Since</th><th>Until</th><th>Status</th><th className="text-right">Paid</th></tr></thead>
            <tbody>{passes.slice(0, 300).map((p) => <tr key={p.id} className="border-t"><td className="py-1.5">{who(p.id)}</td><td>{p.plan || "year"}</td><td>{day(p.since)}</td><td>{day(p.until)}</td>
              <td>{p.active ? (p.renews ? "Active, renews" : "Active, cancelled") : "Ended"}</td><td className="text-right">{usd(p.paid || 0)}</td></tr>)}</tbody></table></div>}
      </section>
      <section className="rounded-xl border p-4"><h2 className="font-bold">Weekly prize payouts ({payouts.length})</h2>
        {payouts.length === 0 ? <p className="text-sm text-muted-foreground">None yet. Weeks are paid automatically after each seventh Daily.</p> :
          <div className="overflow-x-auto"><table className="mt-2 w-full text-sm"><thead><tr className="text-left text-muted-foreground"><th className="py-1">Week</th><th>Player</th><th>Memo</th><th>Date</th><th className="text-right">Sora</th></tr></thead>
            <tbody>{payouts.slice(0, 300).map((p, i) => <tr key={i} className="border-t"><td className="py-1.5">{p.week}</td><td>{who(String(p.user_id || ""))}</td><td>{p.memo}</td><td>{day(p.created_at)}</td><td className="text-right">{p.amount.toLocaleString("en")}</td></tr>)}</tbody></table></div>}
      </section>
      <section className="rounded-xl border p-4"><h2 className="font-bold">Newest sign-ups</h2>
        {players.length === 0 ? <p className="text-sm text-muted-foreground">No sign-ups yet.</p> :
          <div className="overflow-x-auto"><table className="mt-2 w-full text-sm"><thead><tr className="text-left text-muted-foreground"><th className="py-1">Name</th><th>Handle</th><th>Email</th><th>Via</th><th>Joined</th></tr></thead>
            <tbody>{[...players].sort((a, b) => String(b.joined || b.created).localeCompare(String(a.joined || a.created))).slice(0, 100).map((p, i) => <tr key={p.id || i} className="border-t">
              <td className="py-1.5">{p.name || p.display_name}</td><td>{p.handle ? `@${p.handle}` : ""}</td><td>{p.email}</td><td>{p.via}</td><td>{day(p.joined || p.created)}</td></tr>)}</tbody></table></div>}
      </section>
    </AdminPage>
  );
}
