import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { getTenant } from "@/lib/tenant";
import { getSession, hasRole } from "@/lib/session";
import { pb, q } from "@/lib/pb";
import { env } from "@/lib/env";
import { getSettings, SWITCHES } from "@/lib/settings";
import { dataRoot } from "@/lib/analytics-server";
import { setSwitch } from "@/app/actions/admin";
import { AdminForm } from "@/components/admin/AdminForm";
import { H1, Table, Ago, Pill } from "@/components/admin/ui";

export const metadata = { title: "Settings & Audit" };

async function mailSink(tenantSlug: string) {
  try {
    const dir = path.join(dataRoot(), "mail-sink");
    const files = (await readdir(dir)).sort().reverse().slice(0, 30);
    const out = [];
    for (const f of files) { const body = await readFile(path.join(dir, f), "utf8"); if (body.includes(`X-Palavva-Tenant: ${tenantSlug}`)) out.push({ f, body }); }
    return out.slice(0, 10);
  } catch { return []; }
}

export default async function Settings() {
  const t = await getTenant();
  const session = (await getSession(t))!;
  const [settings, auditRows, mail] = await Promise.all([getSettings(t.id), pb.list("audit_events", { filter: `tenant_id=${q(t.id)}`, sort: "-created", perPage: 100 }), mailSink(t.slug)]);
  const admin = hasRole(session, "tenant_admin");
  return (
    <div className="flex flex-col gap-6">
      <H1 sub="Kill switches act immediately and are audited.">Settings &amp; Audit</H1>
      <section className="card p-5"><h2 className="text-lg font-bold">Policy gates (environment, read-only)</h2>
        <ul className="mt-2 flex flex-wrap gap-2 text-sm">
          <li><Pill tone="bad">ORACLE_DEPLOYMENT_AUTHORIZED={String(env.oracleAuthorized)}</Pill></li><li><Pill tone="bad">PUBLIC_LAUNCH_AUTHORIZED={String(env.publicLaunchAuthorized)}</Pill></li>
          <li><Pill tone="bad">PAID_FALLBACKS_ENABLED={String(env.paidFallbacksEnabled)}</Pill></li><li><Pill>MODEL_PROVIDER={env.modelProvider}</Pill></li><li><Pill>SHOW_DEMO_CONTENT={String(env.showDemo)}</Pill></li>
        </ul></section>
      <section className="card p-5"><h2 className="text-lg font-bold">Kill switches</h2>
        <div className="mt-3 grid gap-4 md:grid-cols-2">{SWITCHES.map((k) => { const on = settings[k] === true; return (
          <div key={k} className="rounded-lg border border-border p-3" data-testid={`switch-${k}`}>
            <p className="font-semibold">{k} <Pill tone={on ? "warn" : "neutral"}>{on ? "ON" : "OFF"}</Pill></p>
            {admin ? <AdminForm action={setSwitch} submit={on ? "Turn off" : "Turn on"}><input type="hidden" name="key" value={k} /><input type="hidden" name="value" value={String(!on)} />
              <label className="sr-only" htmlFor={`r-${k}`}>Reason</label><input id={`r-${k}`} name="reason" className="input" placeholder="Reason (required)" /></AdminForm> : <p className="meta">Tenant admins can change switches.</p>}
          </div>); })}</div></section>
      <section className="card p-5"><h2 className="text-lg font-bold">Local mail sink</h2><p className="meta">No email is sent from the local build; messages for this tenant are listed here.</p>
        {mail.length === 0 ? <p className="mt-2 text-sm text-muted">No messages.</p> : <ul className="mt-2 flex flex-col gap-2">{mail.map((m) => <li key={m.f}><pre className="overflow-x-auto whitespace-pre-wrap rounded-lg bg-card-muted p-3 text-xs">{m.body}</pre></li>)}</ul>}</section>
      <Table caption="Audit log (append-only, latest 100)" head={["When", "Actor", "Action", "Object", "Details"]}>
        {auditRows.map((a) => <tr key={a.id}><td className="px-3 py-2"><Ago v={a.created} /></td><td className="px-3 py-2">{a.actor_type}:{String(a.actor_id).slice(0, 10)}</td><td className="px-3 py-2">{a.action}</td>
          <td className="px-3 py-2">{a.object_type}/{String(a.object_id).slice(0, 10)}</td><td className="px-3 py-2 text-xs">{JSON.stringify(a.metadata_safe ?? {}).slice(0, 160)}</td></tr>)}
      </Table>
    </div>
  );
}
