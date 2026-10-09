import { getTenant } from "@/lib/tenant";
import { pb, q } from "@/lib/pb";
import { sourceAction } from "@/app/actions/admin";
import { AdminForm } from "@/components/admin/AdminForm";
import { H1, Pill, Ago } from "@/components/admin/ui";

export const metadata = { title: "News Sources" };

export default async function Sources() {
  const t = await getTenant();
  const rows = await pb.list("sources", { filter: `tenant_id=${q(t.id)}`, sort: "-enabled,publisher_name", perPage: 200 });
  const counts = await Promise.all(rows.map(async (s) => ({
    total: await pb.count("source_items", `tenant_id=${q(t.id)} && source_id=${q(s.id)}`),
    day: await pb.count("source_items", `tenant_id=${q(t.id)} && source_id=${q(s.id)} && created >= ${q(new Date(Date.now() - 86400_000).toISOString().replace("T", " "))}`),
    ignored: await pb.count("source_items", `tenant_id=${q(t.id)} && source_id=${q(s.id)} && status='ignored'`),
  })));
  return (
    <div>
      <H1 sub="Sources are fetched only when rights are approved AND fetching is enabled. A healthy badge needs a recent success, not just a valid URL.">News Sources</H1>
      <div className="flex flex-col gap-4">
        {rows.map((s, i) => {
          const stale = s.enabled && s.last_success_at && Date.now() - new Date(s.last_success_at.replace(" ", "T")).getTime() > 3 * (s.fetch_interval_minutes || 60) * 60_000;
          const health = !s.enabled ? "Not fetching" : !s.last_success_at ? "Never fetched" : s.consecutive_failures ? `Failing (${s.last_error_code})` : stale ? "Stale" : "Fetched recently";
          return (
            <section key={s.id} className="card p-4" aria-label={s.publisher_name} data-testid="source-row">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-bold">{s.publisher_name}</h2>
                <Pill tone={s.rights_status === "approved" ? "good" : s.rights_status === "revoked" ? "bad" : "warn"}>Rights: {s.rights_status}</Pill>
                <Pill>{s.usage_policy}</Pill><Pill tone={health === "Fetched recently" ? "good" : s.enabled ? "warn" : "neutral"}>{health}</Pill>
                {s.is_fixture && <Pill>fixture</Pill>}
              </div>
              <p className="meta mt-1 break-all">{s.endpoint_url || "No endpoint"} · {s.source_class}/{s.trust_tier} · every {s.fetch_interval_minutes} min</p>
              <p className="meta">Last attempt <Ago v={s.last_attempt_at} /> · last success <Ago v={s.last_success_at} /> · next due <Ago v={s.next_fetch_at} /> · items {counts[i].total} total, {counts[i].day} in 24h, {counts[i].ignored} ignored</p>
              {s.rights_notes && <p className="mt-1 text-sm"><span className="font-semibold">Rights notes:</span> {s.rights_notes}{s.license_url && <> · <a className="link" href={s.license_url} target="_blank" rel="noopener noreferrer">terms</a></>}</p>}
              <div className="mt-3 flex flex-wrap gap-3">
                {[["test", "Test fetch"], ...(s.rights_status === "approved" ? [["ingest", "Fetch now"], [s.enabled ? "pause" : "resume", s.enabled ? "Pause" : "Enable"], ["revoke", "Revoke rights"]] : [])].map(([a, l]) => (
                  <AdminForm key={a} action={sourceAction} submit={l} confirm={a === "revoke" ? "Revoke rights? Fetching stops, stored excerpts are cleared and drafts are held." : undefined}>
                    <input type="hidden" name="source_id" value={s.id} /><input type="hidden" name="action" value={a} />
                  </AdminForm>
                ))}
              </div>
              {s.rights_status !== "approved" && (
                <details className="mt-3"><summary className="cursor-pointer text-sm font-semibold">Record a rights approval</summary>
                  <AdminForm action={sourceAction} submit="Approve rights" className="mt-2 max-w-xl">
                    <input type="hidden" name="source_id" value={s.id} /><input type="hidden" name="action" value="approve_rights" />
                    <label className="field-label" htmlFor={`lu-${s.id}`}>License / terms URL</label><input id={`lu-${s.id}`} name="license_url" className="input" placeholder="https://" />
                    <label className="field-label" htmlFor={`up-${s.id}`}>Usage policy</label>
                    <select id={`up-${s.id}`} name="usage_policy" className="input"><option value="link_only">Link only</option><option value="metadata_only">Metadata only</option><option value="permitted_excerpt">Permitted excerpt</option><option value="licensed_full">Licensed full text</option></select>
                    <label className="field-label" htmlFor={`rn-${s.id}`}>Evidence notes</label><textarea id={`rn-${s.id}`} name="notes" rows={3} className="input" />
                  </AdminForm>
                </details>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
