import { getTenant } from "@/lib/tenant";
import { pb, q } from "@/lib/pb";
import { env } from "@/lib/env";
import { markInquiryManual, retryInquiry } from "@/app/actions/admin";
import { AdminForm } from "@/components/admin/AdminForm";
import { H1, Metric, Table, Ago, Pill } from "@/components/admin/ui";

export const metadata = { title: "Sponsors & Inquiries" };

export default async function Sponsors() {
  const t = await getTenant();
  const [inq, placements] = await Promise.all([pb.list("sponsor_inquiries", { filter: `tenant_id=${q(t.id)}`, sort: "-created", perPage: 200 }),
    pb.list("sponsor_placements", { filter: `tenant_id=${q(t.id)}`, perPage: 50 })]);
  return (
    <div>
      <H1 sub="Revive stays the source of truth for campaigns and delivery; EspoCRM for leads. Palavva only maps approved zones and forwards inquiries.">Sponsors &amp; Inquiries</H1>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Metric label="EspoCRM" value={null} period="Now" source="ESPOCRM_URL / key" state={env.espoConfigured ? "ok" : "not_connected"} hint="Inquiries are stored locally first and are never lost" />
        <Metric label="Revive Adserver" value={null} period="Now" source="REVIVE_DELIVERY_URL" state={env.reviveConfigured ? "ok" : "not_connected"} hint="Impressions/clicks come from Revive, not estimated here" />
        <Metric label="Inquiries stored" value={inq.length} period="All time" source="sponsor_inquiries" />
      </div>
      <div className="mt-4"><Table caption="Inquiries (PII visible to admins only)" head={["Reference", "Received", "Business", "Contact", "Region / industry", "Forward state", "Actions"]} empty="No inquiries yet.">
        {inq.map((i) => <tr key={i.id}><td className="px-3 py-2 font-mono">{i.reference}</td><td className="px-3 py-2"><Ago v={i.created} /></td><td className="px-3 py-2">{i.business}</td>
          <td className="px-3 py-2">{i.contact_name}<br /><span className="meta">{i.email}</span></td><td className="px-3 py-2">{i.region} / {i.industry}</td>
          <td className="px-3 py-2"><Pill tone={i.forward_state === "FORWARDED" ? "good" : i.forward_state === "FORWARD_FAILED" ? "bad" : "warn"}>{i.forward_state}</Pill>{i.attempts ? <span className="meta"> · {i.attempts} attempts</span> : null}</td>
          <td className="px-3 py-2"><div className="flex flex-wrap gap-2"><AdminForm action={retryInquiry} submit="Retry forward"><input type="hidden" name="id" value={i.id} /></AdminForm>
            {i.forward_state !== "MANUAL" && <AdminForm action={markInquiryManual} submit="Handle manually"><input type="hidden" name="id" value={i.id} /></AdminForm>}</div></td></tr>)}
      </Table></div>
      <div className="mt-4"><Table caption="Placement map (approved zones only render)" head={["Position", "Revive zone", "Enabled", "Approved by", "Disclosure"]}>
        {placements.map((p) => <tr key={p.id}><td className="px-3 py-2">{p.position_key}</td><td className="px-3 py-2">{p.revive_zone_id || "none"}</td><td className="px-3 py-2">{p.enabled ? "yes" : "no"}</td>
          <td className="px-3 py-2">{p.approved_by || "–"}</td><td className="px-3 py-2">{p.disclosure}</td></tr>)}
      </Table></div>
    </div>
  );
}
