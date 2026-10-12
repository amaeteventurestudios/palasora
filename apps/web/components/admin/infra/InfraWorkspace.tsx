"use client";
// ISSUE-21 Infrastructure & Services workspace (read-only). Every row is something discovered on this host or a
// configured integration; "running" (process alive) and "healthy" (health check passed) are different statuses.
import { useState } from "react";
import { DataTable, type Column } from "../DataTable";
import { Badge } from "@/components/ui/badge";
import { HelpTip } from "../HelpTip";
import type { Inventory, PackageRow, ServiceRow } from "@/lib/admin/inventory";
import { impactOf } from "@/lib/admin/impact";

const TABS = ["Services", "Installed software", "Dependencies", "Jobs", "Capacity", "Backups", "Alerts"] as const;
const STATUS: Record<string, { label: string; tone: "default" | "secondary" | "destructive" | "outline" }> = {
  healthy: { label: "Healthy (check passed)", tone: "default" }, running: { label: "Running (no health check)", tone: "secondary" }, degraded: { label: "Degraded", tone: "destructive" },
  down: { label: "Down", tone: "destructive" }, not_configured: { label: "Not configured", tone: "outline" }, unknown: { label: "Unknown", tone: "outline" } };
const JOB_STATES: Record<string, string> = { queued: "Waiting to start", running: "Running now", done: "Finished", dead: "Failed after retries (needs a look)", deferred: "Waiting on purpose (a limit or a pause)" };
const DEFER: Record<string, string> = { COUNTRY_QUOTA: "Normal throttle: that country used its hourly writing quota; the job runs when the hour frees up.",
  CITY_BUDGET: "Normal throttle: the network-wide writing budget is used for now.", MODEL_DISABLED: "Paid writing is paced or switched off; the job waits.", MODEL_TIMEOUT: "The model was slow; it will retry.",
  MODEL_UNAVAILABLE: "The model could not be reached; it will retry." };
const gb = (n: number) => `${(n / 1024 ** 3).toFixed(1)} GB`;

export function InfraWorkspace({ inv }: { inv: Inventory }) {
  const [tab, setTab] = useState<(typeof TABS)[number]>("Services");
  const [what, setWhat] = useState<string>("pocketbase");
  const svcCols: Column<ServiceRow>[] = [
    { key: "n", header: "Component", cell: (r) => <span><span className="font-medium">{r.name}</span><br /><span className="text-xs text-muted-foreground">{r.purpose}</span></span>, sort: (r) => r.name },
    { key: "k", header: "Kind", cell: (r) => r.kind, sort: (r) => r.kind },
    { key: "s", header: "Status", cell: (r) => <Badge variant={STATUS[r.status].tone}>{STATUS[r.status].label}</Badge>, sort: (r) => r.status },
    { key: "d", header: "Detail", cell: (r) => <span className="text-xs">{r.detail}</span> },
    { key: "v", header: "Version", cell: (r) => <span className="text-xs">{r.version}</span> },
    { key: "h", header: "Host", cell: (r) => <span className="text-xs">{r.host}</span>, sort: (r) => r.host },
    { key: "u", header: "Up / CPU / memory", cell: (r) => <span className="whitespace-nowrap text-xs tabular-nums">{r.uptime ?? "-"} · {r.cpu ?? "-"}% · {r.rssMb != null ? `${r.rssMb} MB` : "-"}</span> },
    { key: "l", header: "Licence", cell: (r) => <span className="text-xs">{r.license}</span> },
  ];
  const pkgCols: Column<PackageRow>[] = [
    { key: "n", header: "Package", cell: (r) => r.name, sort: (r) => r.name.toLowerCase() }, { key: "v", header: "Version", cell: (r) => r.version },
    { key: "l", header: "Licence", cell: (r) => r.license, sort: (r) => r.license }, { key: "e", header: "Ecosystem", cell: (r) => (r.ecosystem === "npm" ? "Web (npm)" : "Python"), sort: (r) => r.ecosystem },
    { key: "d", header: "Shipped", cell: (r) => (r.ecosystem === "npm" ? (r.direct ? "app dependency" : "build/test only") : "editorial service"), sort: (r) => String(r.direct) },
  ];
  const nodes = [...new Set(inv.edges.flatMap((e) => [e.from, e.to]))].sort();
  const name = (id: string) => inv.services.find((s) => s.id === id)?.name ?? id;
  const impacted = impactOf(what, inv.edges);
  const memUsed = inv.host.memAvailable != null ? inv.host.memTotal - inv.host.memAvailable : inv.host.memTotal - inv.host.memFree;
  return (
    <div className="flex flex-col gap-3">
      <nav aria-label="Infrastructure sections" className="flex flex-wrap gap-2" data-testid="infra-tabs">{TABS.map((t) => (
        <button key={t} type="button" onClick={() => setTab(t)} aria-pressed={tab === t} className={`rounded-full border px-3 py-1 text-sm font-semibold ${tab === t ? "border-transparent bg-primary text-primary-foreground" : "hover:bg-accent"}`}>
          {t}{t === "Alerts" && inv.alerts.length ? ` (${inv.alerts.length})` : ""}</button>))}</nav>
      {tab === "Services" && <DataTable caption="Services" testid="infra-services" rows={inv.services} columns={svcCols} rowKey={(r) => r.id} search={(r) => `${r.name} ${r.purpose} ${r.detail} ${r.version}`} initialPageSize={50}
        filters={[{ key: "s", label: "Status", options: Object.entries(STATUS).map(([value, v]) => ({ value, label: v.label })), get: (r) => r.status },
          { key: "k", label: "Kind", options: ["process", "endpoint", "database", "model", "external"].map((v) => ({ value: v, label: v })), get: (r) => r.kind }]} />}
      {tab === "Installed software" && <DataTable caption="Installed software" testid="infra-packages" rows={inv.packages} columns={pkgCols} rowKey={(r) => r.id} search={(r) => `${r.name} ${r.license}`} initialPageSize={50}
        filters={[{ key: "e", label: "Ecosystem", options: [{ value: "npm", label: "Web (npm)" }, { value: "python", label: "Python" }], get: (r) => r.ecosystem },
          { key: "l", label: "Licence", options: ["MIT", "Apache-2.0", "BSD-3-Clause", "ISC", "unknown"].map((v) => ({ value: v, label: v })), get: (r) => (["MIT", "Apache-2.0", "BSD-3-Clause", "ISC"].includes(r.license) ? r.license : r.license === "unknown" ? "unknown" : "") }]}
        empty="Package list unavailable." />}
      {tab === "Dependencies" && (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]" data-testid="infra-deps">
          <div className="rounded-xl border p-3"><p className="flex items-center gap-1 text-sm font-semibold">What stops working if this fails?
            <HelpTip label="Dependency impact" what="Pick a component. Palavva lists every part that depends on it, directly or through another part, based on how the system is configured." why="Knowing the blast radius before a restart or an outage helps you warn people and fix the right thing first." /></p>
            <select value={what} onChange={(e) => setWhat(e.target.value)} className="input mt-2 w-full" aria-label="Component" data-testid="impact-select">{nodes.map((n) => <option key={n} value={n}>{name(n)}</option>)}</select>
            <p className="mt-2 text-sm" data-testid="impact-result">{impacted.length ? <>If <b>{name(what)}</b> fails, these are affected: {impacted.map(name).join(", ")}.</> : <>Nothing else depends on <b>{name(what)}</b>.</>}</p></div>
          <div className="overflow-x-auto rounded-xl border"><table className="w-full text-sm"><thead className="bg-card text-xs text-muted-foreground"><tr><th className="px-3 py-2 text-start">Component</th><th className="px-3 py-2 text-start">Depends on</th><th className="px-3 py-2 text-start">Why</th></tr></thead>
            <tbody className="divide-y">{inv.edges.map((e) => <tr key={`${e.from}>${e.to}`} className={impacted.includes(e.from) || e.from === what || e.to === what ? "bg-accent/50" : ""}><td className="px-3 py-1.5">{name(e.from)}</td><td className="px-3 py-1.5">{name(e.to)}</td><td className="px-3 py-1.5 text-xs">{e.why}</td></tr>)}</tbody></table></div>
        </div>)}
      {tab === "Jobs" && (inv.jobs ? (
        <div className="grid gap-4 lg:grid-cols-2" data-testid="infra-jobs">
          <div className="rounded-xl border p-3"><p className="text-sm font-semibold">Jobs by state</p><ul className="mt-1 text-sm">{Object.entries(inv.jobs.byState).map(([k, v]) => <li key={k}><b className="tabular-nums">{v.toLocaleString("en")}</b> {JOB_STATES[k] ?? k}</li>)}</ul>
            {inv.jobs.oldestQueuedMin != null && <p className="mt-1 text-xs text-muted-foreground">Oldest waiting job: {inv.jobs.oldestQueuedMin} min</p>}</div>
          <div className="rounded-xl border p-3"><p className="text-sm font-semibold">Why jobs are waiting</p>{Object.keys(inv.jobs.deferredReasons).length ? <ul className="mt-1 text-sm">{Object.entries(inv.jobs.deferredReasons).map(([k, v]) => <li key={k}><b>{v}</b> × {k}: {DEFER[k] ?? "see the job error"}</li>)}</ul> : <p className="mt-1 text-sm text-muted-foreground">No recent job is waiting on a limit.</p>}</div>
          <div className="rounded-xl border p-3 lg:col-span-2"><p className="text-sm font-semibold">Failed jobs ({inv.jobs.deadLetters.length})</p>{inv.jobs.deadLetters.length ? <ul className="mt-1 text-xs">{inv.jobs.deadLetters.map((d) => <li key={d.job_id}>{d.type}: {d.error}</li>)}</ul> : <p className="text-sm text-muted-foreground">None. Requeue failed jobs from System health.</p>}</div>
        </div>) : <p className="text-sm text-muted-foreground">The job queue did not answer, so nothing is shown rather than a guess.</p>)}
      {tab === "Capacity" && (
        <div className="grid gap-3 sm:grid-cols-3" data-testid="infra-capacity">
          <div className="rounded-xl border p-3"><p className="text-xs text-muted-foreground">Memory in use</p><p className="text-xl font-bold tabular-nums">{gb(memUsed)} / {gb(inv.host.memTotal)}</p><p className="text-xs text-muted-foreground">{inv.host.memAvailable != null ? "Cached memory the system can reclaim counts as available (vm_stat)." : "Free memory only; may overstate use."}</p></div>
          <div className="rounded-xl border p-3"><p className="text-xs text-muted-foreground">Disk</p><p className="text-xl font-bold tabular-nums">{inv.host.disk ? `${gb(inv.host.disk.total - inv.host.disk.free)} / ${gb(inv.host.disk.total)}` : "unknown"}</p><p className="text-xs text-muted-foreground">{inv.host.disk ? `${gb(inv.host.disk.free)} free` : ""}</p></div>
          <div className="rounded-xl border p-3"><p className="text-xs text-muted-foreground">CPU load (1 / 5 / 15 min)</p><p className="text-xl font-bold tabular-nums">{inv.host.load.map((x) => x.toFixed(1)).join(" / ")}</p><p className="text-xs text-muted-foreground">{inv.host.cpus} cores · {inv.host.platform} {inv.host.arch}</p></div>
        </div>)}
      {tab === "Backups" && (
        <div className="rounded-xl border p-3 text-sm" data-testid="infra-backups"><p>Last restore drill evidence: <b>{inv.drill ?? "none found"}</b></p>
          <ul className="mt-2 text-xs">{inv.backups.slice(0, 20).map((b) => <li key={b.name} className="tabular-nums">{b.name} · {(b.size / 1024 ** 2).toFixed(0)} MB · {new Date(b.at).toISOString().slice(0, 16)}</li>)}</ul></div>)}
      {tab === "Alerts" && (inv.alerts.length ? <ul className="flex flex-col gap-2" data-testid="infra-alerts">{inv.alerts.map((a, i) => <li key={i} className="rounded-xl border p-3 text-sm"><Badge variant={a.severity === "critical" ? "destructive" : a.severity === "warning" ? "secondary" : "outline"}>{a.severity}</Badge> <b>{a.title}</b><p className="text-xs text-muted-foreground">{a.detail}</p></li>)}</ul>
        : <p className="text-sm text-muted-foreground" data-testid="infra-alerts">No alerts right now.</p>)}
    </div>
  );
}
