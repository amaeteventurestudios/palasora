// ISSUE-17 sandbox checkout. Clearly not a real payment: no card, no money, nothing leaves this computer.
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireMember } from "@/lib/guard";
import { pb, q } from "@/lib/pb";
import { AdminForm } from "@/components/admin/AdminForm";
import { simulateSandbox } from "@/app/actions/payments";
export const dynamic = "force-dynamic";
export const metadata = { title: "Sandbox checkout", robots: { index: false } };

// The action's own message unmounts with its button when the order moves on, so the page states the result itself.
const OUTCOME: Record<string, string> = {
  paid: "Sandbox: order paid. The sandbox credits were added once; a repeated provider message cannot add them again.",
  failed: "Sandbox: order failed. No credits were added.",
  refunded: "Sandbox: order refunded. The credits from this order were taken back once.",
};

export default async function SandboxCheckout({ params }: { params: Promise<{ id: string }> }) {
  const { tenant, session } = await requireMember("/credits");
  const o = await pb.first("payment_orders", `tenant_id=${q(tenant.id)} && id=${q((await params).id)} && user_id=${q(session.user.id)} && sandbox=true`);
  if (!o) notFound();
  return (
    <div className="container-pv max-w-xl py-8" data-testid="sandbox-checkout">
      <p className="inline-flex rounded-full border border-[var(--warning,#b45309)] px-2 py-0.5 text-xs font-bold uppercase">Sandbox · no real money</p>
      <h1 className="mt-2 text-2xl font-extrabold">Test checkout</h1>
      <p className="mt-1 text-sm text-muted-foreground">This page stands in for a payment provider while live payments are not enabled. The buttons send a signed test event through the same checks a real provider&apos;s message would pass.</p>
      <dl className="card mt-4 grid grid-cols-[8rem_1fr] gap-1 p-4 text-sm"><dt className="text-muted-foreground">Order</dt><dd className="font-mono text-xs">{o.id}</dd>
        <dt className="text-muted-foreground">Amount</dt><dd>{(o.amount_minor / 100).toLocaleString("en", { minimumFractionDigits: 2 })} {o.currency}</dd>
        <dt className="text-muted-foreground">Gives</dt><dd>{o.credits} sandbox AI credits</dd><dt className="text-muted-foreground">Status</dt><dd data-testid="order-status">{o.status}</dd></dl>
      {OUTCOME[o.status] && <p className="mt-3 text-sm font-semibold" role="status" data-testid="order-outcome">{OUTCOME[o.status]}</p>}
      <div className="mt-4 flex flex-wrap gap-2">
        {o.status === "pending" && <AdminForm action={simulateSandbox} submit="Simulate successful payment" variant="primary"><input type="hidden" name="order_id" value={o.id} /><input type="hidden" name="type" value="payment.succeeded" /></AdminForm>}
        {o.status === "pending" && <AdminForm action={simulateSandbox} submit="Simulate failed payment"><input type="hidden" name="order_id" value={o.id} /><input type="hidden" name="type" value="payment.failed" /></AdminForm>}
        {o.status === "paid" && <AdminForm action={simulateSandbox} submit="Simulate refund"><input type="hidden" name="order_id" value={o.id} /><input type="hidden" name="type" value="refund.succeeded" /></AdminForm>}
      </div>
      <p className="mt-4 text-sm"><Link className="link" href="/credits">Back to usage and credits</Link></p>
    </div>
  );
}
