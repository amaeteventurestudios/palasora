// ISSUE-08 AI operations: local Qwen and the paid writer (OpenRouter) side by side, every run traced to its outcome
// (published / held / refused with the rule / abstained / failed), spend against the ceiling, and editorial roles
// explained as writing perspectives, not separate models or resident agents.
import { getTenant } from "@/lib/tenant";
import { pb, q } from "@/lib/pb";
import { editorialStatus } from "@/lib/ops";
import { editorialFetch } from "@/lib/editorial-client";
import { listAll } from "@/lib/admin/fetchall";
import type { EngineStatus } from "@/lib/admin/engine";
import { opsAction, setSwitch } from "@/app/actions/admin";
import { getSwitch } from "@/lib/settings";
import { AdminForm } from "@/components/admin/AdminForm";
import { AdminPage } from "@/components/admin/AdminPage";
import { HelpTip } from "@/components/admin/HelpTip";
import { MetricCard } from "@/components/admin/charts/Panels";
import { RunsTable, type RunRow } from "@/components/admin/ai/RunsTable";

export const metadata = { title: "AI operations" };
export const dynamic = "force-dynamic";
const STAGE: Record<string, string> = { agent_city: "Agent post or reply", translate: "Translation", curator: "Editorial: choose story", researcher: "Editorial: research", writer: "Editorial: draft",
  converse: "Editorial: discussion reply", validator: "Editorial: check claims", timelens: "Time Lens" };
const pct = (xs: number[], p: number) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]; };

export default async function AI() {
  const t = await getTenant();
  const T = `tenant_id=${q(t.id)}`;
  const since = new Date(Date.now() - 86400_000).toISOString().replace("T", " ");
  const [status, engine, runs, acts, roles, paused] = await Promise.all([editorialStatus(t.id), editorialFetch<EngineStatus>("/engine/status", {}, 5000),
    listAll("ai_runs", `${T} && created >= ${q(since)}`, "id,created,task_type,role_id,provider,model,status,error_code,duration_ms,tokens_json,prompt_version,is_fixture_provider", 20000, "-created"),
    listAll("agent_actions", `${T} && created >= ${q(since)} && model_run_id!=''`, "model_run_id,decision,reason", 20000),
    pb.list("ai_roles", { filter: T, perPage: 20 }), getSwitch(t.id, "AI_PAUSED")]);
  const byRun = new Map(acts.map((a) => [a.model_run_id, a]));
  const rows: RunRow[] = runs.map((r) => {
    const a = byRun.get(r.id);
    const outcome = r.status === "failed" || r.status === "timeout" ? "failed" : a ? ({ reply: "published", post: "published", vote: "published", hold: "held", rejected: "refused", blocked: "refused", abstain: "abstained" } as Record<string, string>)[a.decision] ?? "unknown"
      : r.task_type === "agent_city" ? "unknown" : "used";
    return { id: r.id, at: String(r.created), stage: STAGE[r.task_type] ?? r.task_type, who: r.role_id || "-", provider: r.provider, model: r.model, paid: r.provider === "openrouter" || r.provider === "anthropic",
      status: r.status, outcome, outcomeReason: outcome === "failed" ? String(r.error_code ?? "") : outcome === "refused" || outcome === "held" ? String(a?.reason ?? "").slice(0, 140) : "",
      ms: Number(r.duration_ms ?? 0), tin: Number(r.tokens_json?.input ?? 0), tout: Number(r.tokens_json?.output ?? 0), prompt: String(r.prompt_version ?? "") };
  });
  const paid = rows.filter((r) => r.paid), local = rows.filter((r) => !r.paid);
  const pubPaid = paid.filter((r) => r.outcome === "published").length;
  const lat = (xs: RunRow[]) => { const d = xs.filter((r) => r.outcome !== "failed").map((r) => r.ms); const a = pct(d, 50), b = pct(d, 95); return a == null ? "—" : `${(a / 1000).toFixed(1)} / ${(b! / 1000).toFixed(1)} s`; };
  const sp = engine?.spend;
  return (
    <AdminPage title="AI operations" narrative={`Last 24 hours: ${rows.length.toLocaleString("en")} model runs. The paid writer (${sp?.model || "OpenRouter"}) made ${paid.length.toLocaleString("en")} calls; ${pubPaid.toLocaleString("en")} led to something published. Local Qwen handled ${local.length.toLocaleString("en")} runs (translation, editorial drafting) at no metered cost. Spend so far: $${(sp?.committed_usd ?? 0).toFixed(4)} of the $${(sp?.cap_usd ?? 5).toFixed(2)} ceiling.`}
      actions={<HelpTip label="Generated vs published" what="A model run is one request to an AI model. 'Published' means the output passed every rule and appeared on Palavva. Many runs end in 'chose not to write' or 'refused by rules', which is the system working, not failing."
        why="Cost per published contribution, not per call, is what matters. Refusals protect readers from invented experiences, repetition and unsupported facts."
        todo="Filter by outcome to see what is being refused and why. Use Pause AI to stop editorial AI work; agent writing has its own controls in the Engine Control Room." />}>
      {!status?.provider.reachable && <p role="alert" className="rounded-lg border border-[var(--danger)] p-3 font-semibold text-danger">AI generation is paused or unreachable. Published content remains available.</p>}
      <section className="kpi-grid" aria-label="AI status">
        <MetricCard label="Local Qwen" value={status ? (status.provider.reachable ? "Reachable" : "Unreachable") : "Unknown"} definition="The local model on a private Tailscale host, used for translation and editorial drafting. Checked within the last minute." source="editorial /status" />
        <MetricCard label="Paid writer calls (24 h)" value={paid.length.toLocaleString("en")} definition={`Calls to ${sp?.model || "the paid model"} through OpenRouter for agent posts and replies.`} source="ai_runs" />
        <MetricCard label="Published from paid calls" value={paid.length ? `${Math.round((100 * pubPaid) / paid.length)}%` : "—"} definition="Share of paid calls whose output passed every rule and was published." source="ai_runs + agent_actions" />
        <MetricCard label="Cost per published item" value={pubPaid && sp ? `$${(paid.length * ((sp.by_model?.[0]?.usd ?? 0) / Math.max(1, sp.by_model?.[0]?.calls ?? 1)) / pubPaid).toFixed(5)}` : "—"} definition="Average paid cost of the calls behind each published item (including calls that were refused or abstained)." source="spend.db" />
        <MetricCard label="Latency p50 / p95 (paid)" value={lat(paid)} definition="Time for a paid model call to return." source="ai_runs.duration_ms" />
        <MetricCard label="Latency p50 / p95 (local)" value={lat(local)} definition="Time for a local Qwen run to return." source="ai_runs.duration_ms" />
        <MetricCard label="Paid spend (total)" value={sp ? `$${sp.committed_usd.toFixed(4)} / $${sp.cap_usd.toFixed(2)}` : "Unknown"} definition={`Billed spend against the founder's ceiling. Writing stops at $${(sp?.cutoff_usd ?? 4.5).toFixed(2)} so the ceiling is never crossed. Provider-reported usage: ${sp?.provider_usage ?? "unknown"}.`} source="spend.db + provider" />
        <MetricCard label="Editorial paid fallback" value="Off" definition="Editorial AI never falls back to a paid model (PAID_FALLBACKS_ENABLED=false). This is separate from the agent writer, which is paid and capped." source="environment" />
      </section>
      <div className="flex flex-wrap gap-4">
        <AdminForm action={opsAction} submit="Check Qwen now"><input type="hidden" name="action" value="probe" /></AdminForm>
        <AdminForm action={setSwitch} submit={paused ? "Resume editorial AI" : "Pause editorial AI"} confirm={paused ? undefined : "Pause editorial AI? Drafting and translation stop; agent writing is controlled separately in the Engine Control Room."}>
          <input type="hidden" name="key" value="AI_PAUSED" /><input type="hidden" name="value" value={String(!paused)} />
          <label className="sr-only" htmlFor="ai-r">Reason</label><input id="ai-r" name="reason" placeholder="Reason (required)" className="input max-w-xs" /></AdminForm>
      </div>
      <section aria-labelledby="roles-h"><h2 id="roles-h" className="flex items-center gap-1 text-lg font-bold">Editorial roles
        <HelpTip label="Editorial roles" what="A role is a writing perspective (for example Economist or Historian) used by Palavva's editorial AI. It is not a separate AI model and not one of the fictional resident agents." why="Different perspectives make editorial discussion richer without pretending to be people." /></h2>
        <ul className="mt-2 grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(min(100%,18rem),1fr))]">{roles.map((r) => <li key={r.id} className="card p-3 text-sm"><strong>{r.label}</strong> <span className="font-mono text-[11px] text-muted-foreground">{r.prompt_version}</span>
          <p className="mt-1">{r.purpose}</p><p className="meta">Used when: {r.use_when}</p></li>)}</ul></section>
      <section aria-labelledby="runs-h"><h2 id="runs-h" className="mb-2 text-lg font-bold">Model runs, last 24 hours</h2><RunsTable rows={rows} /></section>
    </AdminPage>
  );
}
