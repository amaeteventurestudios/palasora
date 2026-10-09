import { getTenant } from "@/lib/tenant";
import { pb } from "@/lib/pb";
import { backupStatus, diskFree, editorialStatus } from "@/lib/ops";
import { opsAction } from "@/app/actions/admin";
import { AdminForm } from "@/components/admin/AdminForm";
import { H1, Metric, Table } from "@/components/admin/ui";

export const metadata = { title: "System Health" };

export default async function Health() {
  const t = await getTenant();
  const [pbOk, status, backup, disk] = await Promise.all([pb.health(), editorialStatus(t.id), backupStatus(), diskFree()]);
  const mem = process.memoryUsage();
  return (
    <div>
      <H1 sub="Mac-local services on loopback. Oracle staging is not authorized (ORACLE_DEPLOYMENT_AUTHORIZED=false).">System Health</H1>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Web (Next.js)" value="Up" period="This request" source="127.0.0.1:3000" hint={`RSS ${(mem.rss / 1e6).toFixed(0)} MB`} />
        <Metric label="PocketBase" value={pbOk ? "Up" : "Down"} period="Now" source="127.0.0.1:8190 /api/health" />
        <Metric label="Editorial service" value={status ? "Up" : "Down"} period="Now" source="127.0.0.1:8100" state={status ? "ok" : "unknown"} />
        <Metric label="Qwen / Tailscale" value={status?.provider.reachable ? "Reachable" : "Unreachable"} period="≤60 s" source="Ollama /api/tags" state={status ? "ok" : "unknown"} />
        <Metric label="Disk free" value={disk ? disk.freeGb.toFixed(1) : null} unit="GB" period="Now" source="statfs(data dir)" state={disk ? "ok" : "unknown"} hint={disk ? `of ${disk.totalGb.toFixed(0)} GB` : undefined} />
        <Metric label="Latest backup" value={backup.ageHours != null ? backup.ageHours.toFixed(1) : null} unit="h old" period="backups/" source="scripts/backup.sh" state={backup.latest ? "ok" : "unknown"} hint={backup.latest ?? "none"} />
        <Metric label="Restore drill" value={backup.restoreDrill ? "Verified" : null} period="Last drill" source="scripts/restore-drill.sh" state={backup.restoreDrill ? "ok" : "unknown"} hint={backup.restoreDrill ?? "not yet run"} />
        <Metric label="Queue" value={status ? Object.entries(status.queue.by_state).map(([k, v]) => `${k}:${v}`).join(" ") : null} period="Now" source="jobs.db" state={status ? "ok" : "unknown"}
          hint={status?.queue.oldest_queued_age_s != null ? `oldest queued ${(status.queue.oldest_queued_age_s / 60).toFixed(0)} min` : undefined} />
      </div>
      <div className="mt-4 flex flex-wrap gap-4">
        <AdminForm action={opsAction} submit="Rebuild search index"><input type="hidden" name="action" value="reindex" /></AdminForm>
      </div>
      <div className="mt-6"><Table caption="Dead letters" head={["Job", "Type", "Error", "Action"]} empty="No dead letters.">
        {(status?.queue.dead_letters ?? []).map((d) => <tr key={d.job_id}><td className="px-3 py-2 font-mono text-xs">{d.job_id.slice(0, 10)}</td><td className="px-3 py-2">{d.type}</td><td className="px-3 py-2">{d.error}</td>
          <td className="px-3 py-2"><AdminForm action={opsAction} submit="Requeue"><input type="hidden" name="action" value="requeue" /><input type="hidden" name="job_id" value={d.job_id} /></AdminForm></td></tr>)}
      </Table></div>
      <div className="mt-6"><Table caption="Recent jobs" head={["Job", "Type", "State", "Attempts", "Last error"]} empty="No jobs.">
        {(status?.queue.recent ?? []).map((j) => <tr key={j.job_id}><td className="px-3 py-2 font-mono text-xs">{j.job_id.slice(0, 10)}</td><td className="px-3 py-2">{j.type}</td><td className="px-3 py-2">{j.state}</td><td className="px-3 py-2">{j.attempts}</td><td className="px-3 py-2">{j.error_class ?? ""}</td></tr>)}
      </Table></div>
    </div>
  );
}
