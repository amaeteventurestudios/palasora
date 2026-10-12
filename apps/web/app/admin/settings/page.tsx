// ISSUE-22 Settings & audit: safeguards in plain words (what ON really does), emergency controls, read-only deployment
// gates, email status (local mail sink = development only), and a searchable, redacted, append-only audit history.
import Link from "next/link";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { getTenant } from "@/lib/tenant";
import { getSession, can } from "@/lib/session";
import { pb, q } from "@/lib/pb";
import { env } from "@/lib/env";
import { getSettings, SWITCHES, type SwitchKey } from "@/lib/settings";
import { dataRoot } from "@/lib/analytics-server";
import { setSwitch } from "@/app/actions/admin";
import { SWITCH_INFO, redact, redactText, runningWord } from "@/lib/admin/switches";
import { AdminForm } from "@/components/admin/AdminForm";
import { AdminPage } from "@/components/admin/AdminPage";
import { HelpTip } from "@/components/admin/HelpTip";
import { Badge } from "@/components/ui/badge";
import { AuditTable, type AuditRow } from "@/components/admin/settings/AuditTable";

export const metadata = { title: "Settings & audit" };
export const dynamic = "force-dynamic";

async function mailSink(tenantSlug: string) {
  try {
    const dir = path.join(dataRoot(), "mail-sink");
    const files = (await readdir(dir)).sort().reverse().slice(0, 40);
    const out: { f: string; to: string; subject: string; body: string }[] = [];
    for (const f of files) {
      const body = await readFile(path.join(dir, f), "utf8");
      if (!body.includes(`X-Palavva-Tenant: ${tenantSlug}`)) continue;
      const to = /^To:\s*(.+)$/m.exec(body)?.[1] ?? "";
      out.push({ f, to: to.replace(/^(.).*(@.*)$/, "$1…$2"), subject: /^Subject:\s*(.+)$/m.exec(body)?.[1] ?? "(no subject)", body: redactText(body) });
    }
    return out.slice(0, 10);
  } catch { return []; }
}
const plain = (action: string, meta: Record<string, unknown>) => {
  if (action === "settings.switch") return `Switch ${String(meta.key ?? "")} set to ${meta.value ? "ON" : "OFF"}${meta.reason ? ` — “${String(meta.reason).slice(0, 80)}”` : ""}`;
  return action.replace(/[._]/g, " ") + (meta.reason ? ` — “${String(meta.reason).slice(0, 80)}”` : "");
};

export default async function Settings() {
  const t = await getTenant();
  const session = (await getSession(t))!;
  const [settings, auditRows, mail] = await Promise.all([getSettings(t.id), pb.list("audit_events", { filter: `tenant_id=${q(t.id)}`, sort: "-created", perPage: 1000 }), mailSink(t.slug)]);
  const admin = can(session, "operations", "administer");
  const sw = (group: "emergency" | "config") => SWITCHES.filter((k) => SWITCH_INFO[k].group === group);
  const audit: AuditRow[] = auditRows.map((a) => { const meta = { ...(a.metadata_safe ?? {}), key: a.object_id } as Record<string, unknown>;
    return { id: a.id, at: String(a.created), actor: a.actor_type === "user" ? `person ${String(a.actor_id).slice(0, 6)}…` : String(a.actor_id || a.actor_type), actorType: String(a.actor_type),
      action: String(a.action), system: String(a.action).split(".")[0], object: `${a.object_type}/${String(a.object_id).slice(0, 12)}`, summary: plain(String(a.action), meta),
      raw: JSON.stringify(redact({ action: a.action, actor_type: a.actor_type, object_type: a.object_type, object_id: a.object_id, revision: a.revision, metadata: a.metadata_safe }), null, 2) }; });
  const stopped = SWITCHES.filter((k) => runningWord(k, settings[k] === true) === "Stopped");
  const card = (k: SwitchKey) => { const on = settings[k] === true; const i = SWITCH_INFO[k]; const word = runningWord(k, on); return (
    <div key={k} className="rounded-lg border p-3" data-testid={`switch-${k}`}>
      <p className="flex flex-wrap items-center gap-2 font-semibold">{i.label} <Badge variant={word === "Running" ? "default" : "destructive"}>{word}</Badge>
        <span className="font-mono text-[11px] font-normal text-muted-foreground">{k} = {on ? "ON" : "OFF"}</span></p>
      <p className="mt-1 text-sm text-muted-foreground">{on ? i.whenOn : i.whenOff}</p>
      {admin ? <AdminForm action={setSwitch} submit={on ? "Turn off" : "Turn on"} confirm={i.disruptive ? `Change "${i.label}"? ${on ? i.whenOff : i.whenOn}` : undefined} className="mt-2">
        <input type="hidden" name="key" value={k} /><input type="hidden" name="value" value={String(!on)} />
        <label className="sr-only" htmlFor={`r-${k}`}>Reason</label><input id={`r-${k}`} name="reason" className="input" placeholder="Reason (required)" /></AdminForm>
        : <p className="meta mt-1">Read-only: tenant admins can change this.</p>}
    </div>); };
  return (
    <AdminPage title="Settings & audit" narrative={stopped.length ? `${stopped.length} feature(s) are currently stopped: ${stopped.map((k) => SWITCH_INFO[k].label).join(", ")}.` : "Every safeguard is in its normal running state."}
      actions={<HelpTip label="What 'audited' means" what="Every change to a switch or setting is written to an append-only log with who, when, what changed and why. Entries cannot be edited or deleted from the app."
        why="If something goes wrong you can see exactly what changed, by whom, and put it back."
        todo="Search the audit history below. Switch names that end in _PAUSED or _DISABLED mean the feature is STOPPED when ON; each card says in words what is happening now." />}>
      <section aria-labelledby="em-h"><h2 id="em-h" className="mb-2 text-lg font-bold">Emergency controls</h2><div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">{sw("emergency").map(card)}</div></section>
      <section aria-labelledby="cfg-h"><h2 id="cfg-h" className="mb-2 text-lg font-bold">Platform configuration</h2><div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">{sw("config").map(card)}</div>
        <p className="mt-2 text-sm">Engine settings (activity, cadence, spend, conversation style) live in the <Link className="link" href="/admin/engine/controls">Engine Control Room</Link>, with their own revisions and rollback.</p></section>
      <section className="rounded-xl border p-4" aria-labelledby="gate-h"><h2 id="gate-h" className="flex items-center gap-1 text-lg font-bold">Deployment gates (read-only)
        <HelpTip label="Deployment gates" what="Settings in the server's environment file that the app cannot change. They block actions that need the founder's explicit approval." why="Going public, deploying to Oracle or spending on paid fallbacks must never happen from a button." /></h2>
        <ul className="mt-2 grid gap-2 text-sm md:grid-cols-2">
          <li><b>Public launch:</b> {env.publicLaunchAuthorized ? "authorized" : "not authorized — search engines are blocked and pages are noindex"}</li>
          <li><b>Oracle deployment:</b> {env.oracleAuthorized ? "authorized" : "not authorized — nothing is deployed there"}</li>
          <li><b>Paid fallback models:</b> {env.paidFallbacksEnabled ? "enabled" : "off — the paid writer is limited by its own $5 ceiling"}</li>
          <li><b>Model provider:</b> {env.modelProvider}</li><li><b>Demo content shown:</b> {env.showDemo ? "yes (labelled)" : "no"}</li>
          <li><b>Admin host:</b> local /admin. The production admin domain spelling (admin.palavva.com vs admin.palava.com) is unresolved and needs the founder; no DNS was changed.</li></ul></section>
      <section className="rounded-xl border p-4" aria-labelledby="mail-h"><h2 id="mail-h" className="text-lg font-bold">Email & notifications</h2>
        <p className="mt-1 text-sm"><Badge variant="outline">Development mail sink</Badge> No email leaves this machine. Messages that would be sent (password resets, verification) are saved as files so they can be checked. No outgoing mail provider is configured; production email needs an authenticated provider plus SPF, DKIM and DMARC before any real sending.</p>
        {mail.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">No captured messages for this site.</p> : <ul className="mt-2 flex flex-col gap-2" data-testid="mail-sink">{mail.map((m) => (
          <li key={m.f}><details className="rounded-lg border p-2"><summary className="cursor-pointer text-sm"><b>{m.subject}</b> <span className="text-xs text-muted-foreground">to {m.to} · {m.f.slice(0, 15)}</span></summary>
            <pre className="mt-2 overflow-x-auto whitespace-pre-wrap rounded bg-card-muted p-2 text-xs">{m.body}</pre></details></li>))}</ul>}
        <p className="mt-1 text-xs text-muted-foreground">Links and codes in these previews are redacted.</p></section>
      <section aria-labelledby="audit-h"><h2 id="audit-h" className="mb-2 text-lg font-bold">Audit history ({audit.length} most recent)</h2><AuditTable rows={audit} /></section>
    </AdminPage>
  );
}
