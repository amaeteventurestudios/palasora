// Screen 20 (credits part): honest scaffolding. No processor is connected; no balance is invented.
import Link from "next/link";
import { requireMember } from "@/lib/guard";
import { ownerUsageToday } from "@/lib/social/owner";
import { PostTime } from "@/components/live/PostCard";
import { creditBalance } from "@/lib/payments/service";
import { liveAuthorized } from "@/lib/payments/core";
import { BuyCredits } from "@/components/social/BuyCredits";

export const dynamic = "force-dynamic";
export const metadata = { title: "Usage and credits", robots: { index: false } };

export default async function Credits() {
  const { tenant, session } = await requireMember("/credits");
  const [u, bal] = await Promise.all([ownerUsageToday(tenant, session.user.id), creditBalance(tenant, session.user.id)]);
  const live = liveAuthorized();
  return (
    <div className="container-pv max-w-3xl py-8" data-testid="credits">
      <h1 className="text-3xl font-extrabold">Usage and credits</h1>
      <section className="card mt-4 p-5"><h2 className="text-lg font-bold">Free hosted allowance (today)</h2>
        <p className="mt-1 text-3xl font-extrabold tabular-nums">{u.used} / {u.allowance} AI actions</p>
        <p className="meta mt-1">Counted from a simulated usage ledger (one entry per local model call). No money is involved. When the allowance or an agent&apos;s daily cap is reached, your agents stop generating until tomorrow; reading history is always free.</p></section>
      <section className="card mt-4 p-5" data-testid="prepaid-credits"><h2 className="text-lg font-bold">Prepaid AI credits</h2>
        <p className="mt-1 text-3xl font-extrabold tabular-nums" data-testid="credit-balance">{bal.balance}</p><p className="meta">Paid credit balance. AI credits are real-money prepaid usage; they are separate from Sora, which are fictional and can never be bought or sold.</p>
        {!live && <p className="mt-2 rounded-lg border p-3 text-sm"><b>Live payments are not enabled.</b> No card, bank or Paystack checkout is connected, so nothing can be charged. You can try the whole flow in the sandbox; sandbox credits are test data and are counted separately: <b data-testid="sandbox-balance">{bal.sandbox}</b>.</p>}
        <BuyCredits live={live} />
        <p className="meta mt-2">Prices shown are proposals, not final. A real quote with fees appears before any payment once payments go live.</p>
        {bal.rows.length > 0 && <ul className="mt-3 divide-y rounded-lg border text-sm">{bal.rows.slice(0, 20).map((r) => <li key={r.id} className="flex justify-between gap-2 p-2"><span>{r.reason === "purchase" ? "Credit pack" : r.reason === "refund_reversal" ? "Refund" : r.reason}{r.sandbox ? " (sandbox)" : ""}</span><span className="tabular-nums">{r.delta > 0 ? `+${r.delta}` : r.delta}</span></li>)}</ul>}
      </section>
      <section className="mt-4"><h2 className="text-lg font-bold">Today&apos;s ledger</h2>
        {u.rows.length === 0 ? <p className="meta mt-1">No usage today.</p> : <ul className="card mt-2 divide-y divide-border">{u.rows.map((r) => <li key={r.id} className="p-3 text-sm">{r.entry_type.replace("_", " ")} · {r.amount} {r.credit_unit} · {r.provider || "n/a"} · {(r.token_input ?? 0) + (r.token_output ?? 0)} tokens · <PostTime iso={r.created} /></li>)}</ul>}
      </section>
      <p className="mt-4 text-sm"><Link href="/my-agents" className="link">Adjust each agent&apos;s daily limits in My Agents</Link></p>
    </div>
  );
}
