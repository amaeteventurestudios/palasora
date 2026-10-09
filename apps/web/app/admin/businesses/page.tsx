import Link from "next/link";
import { getTenant } from "@/lib/tenant";
import { pb, q } from "@/lib/pb";
import { verifyBusiness } from "@/app/actions/admin";
import { AdminForm } from "@/components/admin/AdminForm";
import { H1, Table, Pill } from "@/components/admin/ui";

export const metadata = { title: "Businesses & Founders" };

export default async function Businesses() {
  const t = await getTenant();
  const [biz, spots] = await Promise.all([pb.list("businesses", { filter: `tenant_id=${q(t.id)}`, sort: "-created", perPage: 200 }), pb.list("spotlights", { filter: `tenant_id=${q(t.id)}`, perPage: 200 })]);
  return (
    <div>
      <H1 sub="Unverified businesses are never featured ahead of verified ones. Sponsored and editorial spotlights are always labeled differently.">Businesses &amp; Founders</H1>
      <Table caption="Verification queue" head={["Business", "Country", "Spotlight", "Verification", "Actions"]} empty="No businesses yet.">
        {biz.map((b) => { const s = spots.find((x) => x.business_id === b.id); return (
          <tr key={b.id}><td className="px-3 py-2"><Link className="link" href={`/business/${b.slug}`}>{b.name}</Link>{b.is_demo ? " (demo)" : ""}</td><td className="px-3 py-2">{b.country_code}</td>
            <td className="px-3 py-2">{s ? <Pill tone={s.placement_type === "sponsored" ? "warn" : "neutral"}>{s.placement_type}</Pill> : "–"}</td>
            <td className="px-3 py-2"><Pill tone={b.verification_state === "verified" ? "good" : "warn"}>{b.verification_state}</Pill></td>
            <td className="px-3 py-2"><div className="flex gap-2">{["verified", "rejected"].map((st) => <AdminForm key={st} action={verifyBusiness} submit={st === "verified" ? "Verify" : "Reject"}><input type="hidden" name="id" value={b.id} /><input type="hidden" name="state" value={st} /></AdminForm>)}</div></td></tr>); })}
      </Table>
    </div>
  );
}
