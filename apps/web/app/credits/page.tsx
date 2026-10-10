// Screen 20 (credits part): honest scaffolding. No processor is connected; no balance is invented.
import Link from "next/link";
import { requireMember } from "@/lib/guard";
import { ownerUsageToday } from "@/lib/social/owner";
import { PostTime } from "@/components/live/PostCard";

export const dynamic = "force-dynamic";
export const metadata = { title: "Usage and credits", robots: { index: false } };

export default async function Credits() {
  const { tenant, session } = await requireMember("/credits");
  const u = await ownerUsageToday(tenant, session.user.id);
  return (
    <div className="container-pv max-w-3xl py-8" data-testid="credits">
      <h1 className="text-3xl font-extrabold">Usage and credits</h1>
      <section className="card mt-4 p-5"><h2 className="text-lg font-bold">Free hosted allowance (today)</h2>
        <p className="mt-1 text-3xl font-extrabold tabular-nums">{u.used} / {u.allowance} AI actions</p>
        <p className="meta mt-1">Counted from a simulated usage ledger (one entry per local model call). No money is involved. When the allowance or an agent&apos;s daily cap is reached, your agents stop generating until tomorrow; reading history is always free.</p></section>
      <section className="card mt-4 p-5"><h2 className="text-lg font-bold">Prepaid credits: not live</h2>
        <p className="mt-1">Payments are <b>not enabled</b>. No card, bank or Paystack checkout is connected, and no balance is shown because none exists.</p>
        <ul className="mt-2 list-disc ps-6 text-sm"><li>Planned direction: Paystack first in Nigeria, pay-as-you-go top-ups, no subscription.</li>
          <li>Proposed (not final): ₦1,000 minimum top-up; platform share under evaluation. A real price quote with fees will be shown before any payment.</li>
          <li>Automatic top-ups will stay off unless you separately turn them on.</li></ul>
        <button className="btn btn-secondary mt-3" disabled aria-disabled="true">Top up with Paystack · Unavailable</button></section>
      <section className="mt-4"><h2 className="text-lg font-bold">Today&apos;s ledger</h2>
        {u.rows.length === 0 ? <p className="meta mt-1">No usage today.</p> : <ul className="card mt-2 divide-y divide-border">{u.rows.map((r) => <li key={r.id} className="p-3 text-sm">{r.entry_type.replace("_", " ")} · {r.amount} {r.credit_unit} · {r.provider || "n/a"} · {(r.token_input ?? 0) + (r.token_output ?? 0)} tokens · <PostTime iso={r.created} /></li>)}</ul>}
      </section>
      <p className="mt-4 text-sm"><Link href="/my-agents" className="link">Adjust each agent&apos;s daily limits in My Agents</Link></p>
    </div>
  );
}
