import Link from "next/link";
import { getTenant } from "@/lib/tenant";
import { pb, q } from "@/lib/pb";
import { allLocales } from "@/lib/i18n/context";
import { translationDecision } from "@/app/actions/admin";
import { AdminForm } from "@/components/admin/AdminForm";
import { H1, Table, Ago, Pill } from "@/components/admin/ui";

export const metadata = { title: "Translations" };

export default async function Translations() {
  const t = await getTenant();
  const [locs, reports] = await Promise.all([pb.list("localizations", { filter: `tenant_id=${q(t.id)}`, sort: "-created", perPage: 100 }),
    pb.list("translation_reports", { filter: `tenant_id=${q(t.id)} && status='open'`, sort: "-created", perPage: 50 })]);
  const pieces = locs.length ? await pb.list("editorial_pieces", { filter: `tenant_id=${q(t.id)} && (${[...new Set(locs.map((l) => l.piece_id))].slice(0, 60).map((i) => `id=${q(i)}`).join(" || ")})`, perPage: 100 }) : [];
  const pm = new Map(pieces.map((p) => [p.id, p]));
  return (
    <div>
      <H1 sub="Machine translations are labeled unreviewed until an editor approves or corrects them. Blocked translations are never shown; readers get the original.">Translations</H1>
      <Table caption="Language availability (registry)" head={["Language", "Interface", "Content machine translation", "Note"]}>
        {allLocales().map((l) => <tr key={l.code}><td className="px-3 py-2">{l.native} ({l.code})</td><td className="px-3 py-2"><Pill tone={l.ui === "ready" ? "good" : l.ui === "beta" ? "warn" : "neutral"}>{l.ui}</Pill></td>
          <td className="px-3 py-2"><Pill tone={l.mt === "enabled" ? "warn" : "neutral"}>{l.mt}</Pill></td><td className="px-3 py-2 text-xs">{l.note}</td></tr>)}
      </Table>
      <div className="mt-6"><Table caption={`Open translation reports (${reports.length})`} head={["When", "Locale", "Issue", "Story"]} empty="No open reports.">
        {reports.map((r) => <tr key={r.id}><td className="px-3 py-2"><Ago v={r.created} /></td><td className="px-3 py-2">{r.locale}</td><td className="px-3 py-2">{r.issue}</td>
          <td className="px-3 py-2">{pm.get(r.piece_id) ? <Link className="link" href={`/discussion/${pm.get(r.piece_id)!.slug}`}>{pm.get(r.piece_id)!.headline}</Link> : r.piece_id}</td></tr>)}
      </Table></div>
      <h2 className="mt-6 text-lg font-bold">Recent translations</h2>
      <div className="mt-2 flex flex-col gap-3">{locs.length === 0 ? <p className="text-muted">No translations yet.</p> : locs.map((l) => (
        <section key={l.id} className="card p-4 text-sm" data-testid="localization-row">
          <div className="flex flex-wrap items-center gap-2"><strong>{pm.get(l.piece_id)?.headline ?? l.target_id}</strong>
            <Pill tone={l.status === "reviewed" ? "good" : l.status === "blocked" || l.status === "failed" ? "bad" : "warn"}>{l.status}</Pill>
            <span className="meta">{l.source_locale} → {l.locale} · v{l.source_version} · {l.model} · {l.prompt_version} · reports {l.report_count ?? 0} · <Ago v={l.created} /></span></div>
          <p className="meta mt-1">QA: {Object.entries(l.qa?.checks ?? {}).filter(([, v]) => v === "FAIL").map(([k]) => k).join(", ") || "all checks passed"}{l.qa?.missing_numbers?.length ? ` · missing numbers ${l.qa.missing_numbers.join(", ")}` : ""}{l.qa?.missing_names?.length ? ` · missing names ${l.qa.missing_names.join(", ")}` : ""}</p>
          {Object.keys(l.fields ?? {}).length > 0 && (
            <AdminForm action={translationDecision} submit="Save correction" className="mt-2">
              <input type="hidden" name="id" value={l.id} /><input type="hidden" name="action" value="correct" />
              {Object.entries(l.fields as Record<string, string>).slice(0, 3).map(([k, v]) => (
                <div key={k}><label className="field-label" htmlFor={`f-${l.id}-${k}`}>{k}</label><textarea id={`f-${l.id}-${k}`} name={`field_${k}`} defaultValue={v} rows={2} className="input" dir={l.locale === "ar" ? "rtl" : "ltr"} /></div>))}
            </AdminForm>
          )}
          <div className="mt-2 flex gap-2">
            {l.status !== "reviewed" && l.status !== "failed" && <AdminForm action={translationDecision} submit="Approve as reviewed"><input type="hidden" name="id" value={l.id} /><input type="hidden" name="action" value="approve" /></AdminForm>}
            {l.status !== "blocked" && <AdminForm action={translationDecision} submit="Block"><input type="hidden" name="id" value={l.id} /><input type="hidden" name="action" value="block" /></AdminForm>}
          </div>
        </section>))}</div>
    </div>
  );
}
