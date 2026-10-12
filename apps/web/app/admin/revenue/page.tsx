// A09 Revenue & business (docs/specs/25 §A09). REAL money is only processor-settled payments: none exists yet (no
// processor authorised), so revenue is ₦0 and shown as such. Simulated AI-credit usage, fictional Pals and virtual trade
// volume are labelled and kept apart. Business pipeline and ad/CRM integration health come from their own records.
import { getTenant } from "@/lib/tenant";
import { q } from "@/lib/pb";
import { parseScope, pbTs } from "@/lib/admin/scope";
import { listAll } from "@/lib/admin/fetchall";
import { countryName } from "@/lib/edition";
import { AdminPage } from "@/components/admin/AdminPage";
import { ChartCard, Exceptions, Funnel, MetricCard, type Exception } from "@/components/admin/charts/Panels";
import { RankedBars, TimeSeries } from "@/components/admin/charts/Charts";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

export const metadata = { title: "Revenue & business" };

export default async function Revenue({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const t = await getTenant();
  const s = parseScope(await searchParams);
  const T = `tenant_id=${q(t.id)}`;
  const since = pbTs(s.since);
  const [ledger, biz, inquiries, owners] = await Promise.all([
    listAll("wallet_ledger", `${T} && created >= ${q(since)}`, "wallet_owner,entry_type,amount,day,simulated,provider", 30000),
    listAll("businesses", T, "id,name,country_code,verification_state,created", 2000),
    listAll("sponsor_inquiries", `${T} && created >= ${q(since)}`, "forward_state,region,created", 2000),
    listAll("agents", `${T} && owner_type='user'`, "owner_user_id,created", 5000),
  ]);
  const usage = s.dayList.map((d) => ({ day: d, platform: ledger.filter((l) => l.day === d && l.entry_type === "usage_debit" && l.wallet_owner === "platform-seed-city").reduce((a, l) => a - Number(l.amount), 0),
    owners: ledger.filter((l) => l.day === d && l.entry_type === "usage_debit" && l.wallet_owner !== "platform-seed-city").reduce((a, l) => a - Number(l.amount), 0) }));
  const inqStatus = [...inquiries.reduce((m, i) => m.set(i.forward_state || "stored", (m.get(i.forward_state || "stored") ?? 0) + 1), new Map<string, number>()).entries()];
  const bizCountry = [...biz.reduce((m, b) => (b.country_code ? m.set(b.country_code, (m.get(b.country_code) ?? 0) + 1) : m), new Map<string, number>()).entries()].sort((a, b) => b[1] - a[1]);
  const reviveOk = !!process.env.REVIVE_DELIVERY_URL, crmOk = !!process.env.ESPOCRM_URL && !!process.env.ESPOCRM_API_KEY, paystack = !!process.env.PAYSTACK_SECRET_KEY;
  const exc: Exception[] = [
    { severity: paystack ? "ok" : "warning", title: paystack ? "Paystack configured (sandbox only until authorised)" : "Paystack not configured", detail: "Real top-ups need founder authorisation, merchant approval and legal review (₦500 minimum is the proposed Nigerian floor)." },
    { severity: reviveOk ? "ok" : "warning", title: reviveOk ? "Revive Adserver reachable" : "Revive Adserver: NOT_CONFIGURED", detail: "Sponsored placements stay off until a delivery zone is approved." },
    { severity: crmOk ? "ok" : "warning", title: crmOk ? "EspoCRM connected" : "EspoCRM: NOT_CONFIGURED", detail: "Sponsor inquiries are stored durably and can be forwarded once credentials exist." },
  ];
  return (
    <AdminPage title="Revenue & business" scope={s}
      narrative="Real revenue: ₦0. No payment processor is connected, so no money has been taken. AI-credit usage below is a SIMULATED ledger used to enforce caps; Pals and virtual trading volume are fictional and never appear here as revenue.">
      <section className="kpi-grid">
        <MetricCard label="Settled revenue" value="₦0" definition="Processor-settled top-ups net of refunds. Zero because no processor is connected (not unknown)." source="payments (none connected)" sub="Paystack awaiting authorisation" />
        <MetricCard label="Paying owners" value="0" definition="Owners with at least one settled top-up." source="payments (none connected)" slot={2} />
        <MetricCard label="Simulated credit use" value={String(usage.reduce((a, d) => a + d.platform + d.owners, 0))} definition="AI-call units debited from the SIMULATED wallet ledger (caps only; no money)." source="wallet_ledger simulated=true" slot={3} sub="units, not money" />
        <MetricCard label="Businesses" value={String(biz.length)} definition="Business profiles stored; verified ones carry a staff verification record." source="businesses" slot={4} sub={`${biz.filter((b) => b.verification_state === "verified").length} verified`} />
        <MetricCard label="Sponsor inquiries" value={String(inquiries.length)} definition="Inquiries submitted on /advertise in the window." source="sponsor_inquiries" slot={5} />
      </section>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <ChartCard title="Simulated AI-credit usage per day" description="Units debited for model calls: Palavva's seed city vs user-owned agents. Simulated ledger, no money." table={{ head: ["Day", "Seed city", "Owners"], rows: usage.map((d) => [d.day, d.platform, d.owners]) }}>
          <TimeSeries data={usage} kind="bar" stacked series={[{ key: "platform", label: "Seed city (Palavva)", slot: 2 }, { key: "owners", label: "User-owned agents", slot: 1 }]} />
        </ChartCard>
        <ChartCard title="Path to first top-up" description="Owner accounts → agents → paid top-up (blocked: no processor)">
          <Funnel steps={[{ label: "Owners with an agent", n: new Set(owners.map((o) => o.owner_user_id)).size }, { label: "Opened usage & credits", n: 0, note: "not instrumented until payments are authorised" }, { label: "Settled top-up", n: 0, note: "no processor connected" }]} />
        </ChartCard>
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <ChartCard title="Proposed prepaid pricing by country" description="Hypotheses pending verification; not live prices">
          <Table><TableHeader><TableRow><TableHead>Market</TableHead><TableHead>Route</TableHead><TableHead>Minimum</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
            <TableBody><TableRow><TableCell>Nigeria</TableCell><TableCell>Paystack</TableCell><TableCell>₦500</TableCell><TableCell><Badge variant="outline">proposed</Badge></TableCell></TableRow>
              {["GH", "KE", "ZA", "EG", "SN"].map((c) => <TableRow key={c}><TableCell>{countryName(c)}</TableCell><TableCell>to research</TableCell><TableCell>—</TableCell><TableCell><Badge variant="outline">not started</Badge></TableCell></TableRow>)}</TableBody></Table>
          <p className="mt-2 text-xs text-muted-foreground">No mandatory subscription. 15-20% platform share is an unvalidated hypothesis, not a margin claim.</p>
        </ChartCard>
        <ChartCard title="Sponsor inquiries by status"><RankedBars rows={inqStatus.map(([k, v]) => ({ label: k, value: v }))} slot={5} valueLabel="Inquiries" /></ChartCard>
        <ChartCard title="Businesses by country"><RankedBars rows={bizCountry.slice(0, 10).map(([k, v]) => ({ label: countryName(k), value: v }))} slot={4} valueLabel="Businesses" /></ChartCard>
      </div>
      <ChartCard title="Commercial integrations"><Exceptions items={exc} /></ChartCard>
    </AdminPage>
  );
}
