import Link from "next/link";
import { getTenant } from "@/lib/tenant";
import { pb, q } from "@/lib/pb";
import { geoDecision } from "@/app/actions/admin";
import { AdminForm } from "@/components/admin/AdminForm";
import { H1, Table, Pill } from "@/components/admin/ui";

export const metadata = { title: "Geography" };

export default async function Geo() {
  const t = await getTenant();
  const [ev, areas, sources] = await Promise.all([
    pb.list("story_geo_evidence", { filter: `tenant_id=${q(t.id)} && piece_id!=''`, sort: "-created", perPage: 200 }),
    // v1.7: all 54 countries have ADM1 areas, but story-to-region tagging (the curated gazetteer) covers NG, ZA, GH, SN and KE;
    // a "coverage gap" is only meaningful where tagging exists, so the table lists those countries' areas.
    pb.list("geo_areas", { filter: "level='admin1' && (country='NG' || country='ZA' || country='GH' || country='SN' || country='KE')", perPage: 200, sort: "code" }),
    pb.list("sources", { filter: `tenant_id=${q(t.id)} && enabled=true && rights_status='approved'`, perPage: 50 }),
  ]);
  const pieces = ev.length ? await pb.list("editorial_pieces", { filter: `tenant_id=${q(t.id)} && (${[...new Set(ev.map((e) => e.piece_id))].slice(0, 80).map((i) => `id=${q(i)}`).join(" || ")})`, perPage: 100 }) : [];
  const pm = new Map(pieces.map((p) => [p.id, p]));
  const mapped = new Map<string, number>();
  for (const e of ev) if ((e.role === "subject" || e.role === "event") && ["verified", "high_confidence"].includes(e.confidence) && !["rejected", "corrected"].includes(e.status)) mapped.set(e.area_code, (mapped.get(e.area_code) ?? 0) + 1);
  const covered = (cc: string) => sources.filter((s) => (s.coverage_areas ?? []).some((c: string) => c === cc || c.startsWith(cc)) || (s.countries ?? []).includes(cc)).length;
  return (
    <div>
      <H1 sub="Where each story is about, with evidence spans. Publisher location and passing or ambiguous mentions never light the map. Correct or reject anything wrong.">Geography</H1>
      <Table caption="Story geography evidence" head={["Story", "Area", "Role", "Confidence", "Evidence", "Status", "Actions"]} empty="No geography evidence yet.">
        {ev.map((e) => (
          <tr key={e.id} data-testid="geo-row">
            <td className="px-3 py-2">{pm.get(e.piece_id) ? <Link className="link" href={`/discussion/${pm.get(e.piece_id)!.slug}`}>{pm.get(e.piece_id)!.headline.slice(0, 60)}</Link> : e.piece_id}</td>
            <td className="px-3 py-2 font-mono">{e.area_code}</td><td className="px-3 py-2">{e.role}</td>
            <td className="px-3 py-2"><Pill tone={e.confidence === "unresolved" ? "bad" : e.confidence === "provisional" ? "warn" : "good"}>{e.confidence}</Pill></td>
            <td className="px-3 py-2 text-xs">{e.evidence_span}<br /><span className="meta">{e.method}</span></td><td className="px-3 py-2">{e.status}</td>
            <td className="px-3 py-2"><div className="flex flex-wrap gap-2">
              <AdminForm action={geoDecision} submit="Confirm"><input type="hidden" name="id" value={e.id} /><input type="hidden" name="action" value="confirm" /></AdminForm>
              <AdminForm action={geoDecision} submit="Reject"><input type="hidden" name="id" value={e.id} /><input type="hidden" name="action" value="reject" /></AdminForm>
              <AdminForm action={geoDecision} submit="Move"><input type="hidden" name="id" value={e.id} /><input type="hidden" name="action" value="correct" />
                <label className="sr-only" htmlFor={`ac-${e.id}`}>Correct area code</label><input id={`ac-${e.id}`} name="area_code" placeholder="NG-KN" className="input w-24 font-mono" /></AdminForm>
            </div></td>
          </tr>))}
      </Table>
      <div className="mt-6"><Table caption="Coverage gaps by area (mapped stories, all time)" head={["Area", "Name", "Mapped stories", "Approved sources covering the country", "Status"]}>
        {areas.map((a) => <tr key={a.code}><td className="px-3 py-2 font-mono">{a.code}</td><td className="px-3 py-2">{a.name}</td><td className="px-3 py-2">{mapped.get(a.code) ?? 0}</td>
          <td className="px-3 py-2">{covered(a.country)}</td><td className="px-3 py-2">{(mapped.get(a.code) ?? 0) > 0 ? <Pill tone="good">reporting</Pill> : <Pill tone="warn">coverage gap</Pill>}</td></tr>)}
      </Table></div>
    </div>
  );
}
