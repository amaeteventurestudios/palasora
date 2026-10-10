// A11 Reliability, security & backups (docs/specs/25 §A11). Gauges show measured values with their baseline; nothing is
// simulated. Restart/rollback stay behind scripts and authorisation; this page never writes to production.
import Link from "next/link";
import { getTenant } from "@/lib/tenant";
import { q } from "@/lib/pb";
import { listAll } from "@/lib/admin/fetchall";
import { services } from "@/lib/admin/common";
import { gb, hostFacts, mb } from "@/lib/admin/host";
import { hubStats } from "@/lib/live-hub";
import { getSettings } from "@/lib/settings";
import { AdminPage } from "@/components/admin/AdminPage";
import { ChartCard, Exceptions, MetricCard, type Exception } from "@/components/admin/charts/Panels";
import { RankedBars, TimeSeries } from "@/components/admin/charts/Charts";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Time } from "@/components/Time";

export const metadata = { title: "Reliability & security" };

export default async function Ops() {
  const t = await getTenant();
  const [h, svc, audit, settings, ev] = await Promise.all([hostFacts(), services(), listAll("audit_events", `tenant_id=${q(t.id)}`, "action,actor_type,created,object_type", 300, "-created"),
    getSettings(t.id), listAll("thread_events", `tenant_id=${q(t.id)} && created >= ${q(new Date(Date.now() - 6 * 3600_000).toISOString().replace("T", " "))}`, "created", 20000)]);
  const memUsed = h.memTotal - h.memFree, diskUsed = h.disk ? h.disk.total - h.disk.free : 0;
  const lastBackup = h.backups[0], backupAgeH = lastBackup ? (Date.now() - lastBackup.at) / 3600_000 : Infinity;
  const lastDrill = h.drills[0];
  const q2 = svc.queue ?? {};
  const switches = Object.entries(settings).filter(([k, v]) => /PAUSED|DISABLED|HALTED/.test(k) && v === true).map(([k]) => k);
  const exc: Exception[] = [];
  for (const p of h.procs) if (!p.running) exc.push({ severity: p.name === "fast" || p.name === "worker" ? "serious" : "critical", title: `${p.name} process not running`, detail: "Start with scripts/dev-up.sh or scripts/worker-restart.sh" });
  if (backupAgeH > 26) exc.push({ severity: "serious", title: lastBackup ? `Last backup ${Math.round(backupAgeH)} h old` : "No backup on disk", detail: "Run scripts/backup.sh (online SQLite backup + integrity check)" });
  if (!lastDrill || Date.now() - lastDrill.at > 14 * 86400_000) exc.push({ severity: "warning", title: "Restore drill older than 14 days", detail: "Run scripts/restore-drill.sh and keep the evidence file" });
  if (switches.length) exc.push({ severity: "warning", title: `Kill switches on: ${switches.join(", ")}`, detail: "Change in Settings & audit", href: "/admin/settings" });
  const hours = Array.from({ length: 36 }, (_, i) => new Date(Date.now() - (35 - i) * 600_000));
  const evSeries = hours.map((d) => ({ day: d.toISOString().slice(11, 16), events: ev.filter((e) => { const ts = new Date(e.created.replace(" ", "T")).getTime(); return ts >= d.getTime() && ts < d.getTime() + 600_000; }).length }));
  const gauge = (label: string, used: number, total: number, fmt: (n: number) => string) => (
    <div><div className="flex justify-between text-sm"><span>{label}</span><span className="tabular-nums">{fmt(used)} / {fmt(total)} ({total ? Math.round((used / total) * 100) : 0}%)</span></div><Progress value={total ? (used / total) * 100 : 0} className="mt-1" aria-label={label} /></div>);
  const actions = [...audit.reduce((m, a) => m.set(a.action, (m.get(a.action) ?? 0) + 1), new Map<string, number>()).entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
  return (
    <AdminPage title="Reliability & security" narrative={`${h.procs.filter((p) => p.running).length}/${h.procs.length} processes running on ${h.platform}/${h.arch} (${h.cpus} CPUs). Last backup ${lastBackup ? `${Math.round(backupAgeH)} h ago` : "never"}; last restore drill ${lastDrill ? new Date(lastDrill.at).toISOString().slice(0, 10) : "never"}. Values are measured on this host; the Oracle ARM64 target is not deployed.`}>
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <MetricCard label="Load (1 min)" value={h.load[0].toFixed(2)} definition={`OS load average; baseline is CPU count (${h.cpus}).`} source="node:os" sub={`5m ${h.load[1].toFixed(2)} · 15m ${h.load[2].toFixed(2)}`} />
        <MetricCard label="Memory used" value={gb(memUsed)} definition="Host memory in use (all processes, not only Palavva)." source="node:os" slot={2} sub={`of ${gb(h.memTotal)}`} />
        <MetricCard label="Disk free" value={h.disk ? gb(h.disk.free) : "unknown"} definition="Free space on the volume holding the project." source="statfs" slot={3} />
        <MetricCard label="Queue" value={String(q2.queued ?? q2.pending ?? 0)} definition="Editorial/agent jobs waiting in jobs.db (writer, ingest, drafts)." source="editorial /status" slot={4} sub={Object.entries(q2).map(([k, v]) => `${k} ${v}`).join(" · ")} />
        <MetricCard label="SSE subscribers" value={String(hubStats().reduce((a, x) => a + x.subscribers, 0))} definition="Live streams connected to the shared per-tenant event hub (one poller per tenant)." source="live-hub (this web process)" slot={5} />
      </section>
      <div className="grid gap-4 xl:grid-cols-2">
        <ChartCard title="Host capacity">{<div className="flex flex-col gap-3">{gauge("Memory", memUsed, h.memTotal, gb)}{h.disk && gauge("Disk", diskUsed, h.disk.total, gb)}{gauge("CPU load (1 min vs cores)", Math.min(h.load[0], h.cpus), h.cpus, (n) => n.toFixed(1))}</div>}
          <p className="mt-3 text-xs text-muted-foreground">Databases: {h.dbs.map((d) => `${d.name} ${mb(d.size)}`).join(" · ")}</p></ChartCard>
        <ChartCard title="Committed events, last 6 h (10-min buckets)" description="Realtime pipeline throughput; gaps mean quiet, not failure" table={{ head: ["Time", "Events"], rows: evSeries.map((x) => [x.day, x.events]) }}>
          <TimeSeries data={evSeries} kind="bar" series={[{ key: "events", label: "Events", slot: 2 }]} height={200} />
        </ChartCard>
      </div>
      <div className="grid gap-4 xl:grid-cols-3">
        <ChartCard title="Processes & services">
          <ul className="flex flex-col gap-1.5 text-sm">{h.procs.map((p) => <li key={p.name} className="flex justify-between"><span>{p.name}</span><Badge variant={p.running ? "secondary" : "destructive"}>{p.running ? `running · pid ${p.pid}` : "stopped"}</Badge></li>)}
            <li className="flex justify-between"><span>PocketBase API</span><Badge variant={svc.pocketbase ? "secondary" : "destructive"}>{svc.pocketbase ? "healthy" : "down"}</Badge></li>
            <li className="flex justify-between"><span>Economy service</span><Badge variant={svc.economy ? "secondary" : "destructive"}>{svc.economy ? "healthy" : "down"}</Badge></li>
            <li className="flex justify-between"><span>Local model (Qwen)</span><Badge variant={svc.model?.reachable ? "secondary" : "destructive"}>{svc.model?.reachable ? `${svc.model.latency_ms ?? "?"} ms` : "unreachable"}</Badge></li></ul>
        </ChartCard>
        <ChartCard title="Backups & restore" description="Online SQLite backups with integrity check (scripts/backup.sh)">
          <ul className="text-sm">{h.backups.slice(0, 6).map((b) => <li key={b.name} className="flex justify-between py-0.5"><span className="truncate"><Time value={new Date(b.at).toISOString()} /></span><span className="tabular-nums">{mb(b.size)}</span></li>)}</ul>
          <p className="mt-2 text-xs text-muted-foreground">{h.backups.length} archives kept (newest 14). Restore drill evidence: {lastDrill ? `${lastDrill.name}` : "none"}.</p>
        </ChartCard>
        <ChartCard title="Exceptions"><Exceptions items={exc} empty="All processes up, backups fresh." /></ChartCard>
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <ChartCard title="Audit trail by action" description="Latest 300 audit events (append-only, enforced in the database)"><RankedBars rows={actions.map(([k, v]) => ({ label: k, value: v }))} slot={4} valueLabel="Events" /></ChartCard>
        <ChartCard title="Recent privileged and system actions">
          <ul className="divide-y text-sm">{audit.slice(0, 12).map((a, i) => <li key={i} className="flex justify-between gap-3 py-1"><span className="truncate">{a.action} <span className="text-muted-foreground">({a.actor_type})</span></span><span className="shrink-0 text-xs text-muted-foreground"><Time value={a.created} /></span></li>)}</ul>
          <p className="mt-2 text-xs text-muted-foreground">Credentials are never shown here; rotation is tracked in docs/evidence. <Link className="link" href="/admin/settings">Settings & audit →</Link></p>
        </ChartCard>
      </div>
    </AdminPage>
  );
}
