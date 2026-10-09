import { getTenant } from "@/lib/tenant";
import { pb, q } from "@/lib/pb";
import { editorialStatus } from "@/lib/ops";
import { opsAction, setSwitch } from "@/app/actions/admin";
import { getSwitch } from "@/lib/settings";
import { AdminForm } from "@/components/admin/AdminForm";
import { H1, Metric, Table, Ago, Pill } from "@/components/admin/ui";

export const metadata = { title: "AI Operations" };

function pct(xs: number[], p: number) { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]; }

export default async function AI() {
  const t = await getTenant();
  const [status, runs, roles, paused] = await Promise.all([editorialStatus(t.id), pb.list("ai_runs", { filter: `tenant_id=${q(t.id)}`, sort: "-created", perPage: 200 }),
    pb.list("ai_roles", { filter: `tenant_id=${q(t.id)}`, perPage: 20 }), getSwitch(t.id, "AI_PAUSED")]);
  const real = runs.filter((r) => !r.is_fixture_provider);
  const ok = real.filter((r) => r.status === "succeeded" || r.status === "abstained");
  const durs = ok.map((r) => r.duration_ms);
  const p50 = pct(durs, 50), p95 = pct(durs, 95);
  const outTok = ok.map((r) => r.tokens_json?.output ?? 0).reduce((a, b) => a + b, 0);
  const versions = [...new Set(runs.map((r) => `${r.prompt_version} · ${r.prompt_hash}`))];
  return (
    <div>
      <H1 sub="Inference runs in a bounded background worker, never during page render. Paid cloud providers are disabled.">AI Operations</H1>
      {!status?.provider.reachable && <p role="alert" className="mb-4 rounded-lg border border-[var(--danger)] p-3 font-semibold text-danger">AI generation is paused or unreachable. Published content remains available.</p>}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Qwen (Ollama over Tailscale)" value={status ? (status.provider.reachable ? "Reachable" : "Unreachable") : null} period="Checked within 60 s" source={`${status?.provider.model ?? "qwen3.5:4b"} on Simeon's iMac`} state={status ? "ok" : "unknown"} hint={status?.provider.latency_ms != null ? `Health latency ${status.provider.latency_ms} ms` : undefined} />
        <Metric label="Real runs (not fixture)" value={real.length} period="Last 200 runs" source="ai_runs" hint={`${ok.length} succeeded/abstained · ${real.length - ok.length} failed/timeout`} />
        <Metric label="Latency p50 / p95" value={p50 != null ? `${(p50 / 1000).toFixed(1)} / ${(p95! / 1000).toFixed(1)}` : null} unit="s" period="Real runs" source="ai_runs.duration_ms" state={p50 != null ? "ok" : "zero"} />
        <Metric label="Output tokens" value={outTok} period="Real runs shown" source="Ollama eval_count" hint="Local hardware: no metered vendor cost" />
        <Metric label="Budget today" value={status?.budget_used_today ?? null} unit={`/ ${status?.budget_limit ?? "?"}`} period="UTC day" source="Worker quota" state={status ? "ok" : "unknown"} hint={`Max concurrency ${status?.max_concurrency ?? 1} · timeout ${status?.timeout_sec ?? 90}s`} />
        <Metric label="Cloud fallback" value="Disabled" period="Policy" source="PAID_FALLBACKS_ENABLED=false" hint="OpenAI / Anthropic / OpenRouter adapters refuse to run" />
      </div>
      <div className="mt-4 flex flex-wrap gap-4">
        <AdminForm action={opsAction} submit="Check Qwen now"><input type="hidden" name="action" value="probe" /></AdminForm>
        <AdminForm action={setSwitch} submit={paused ? "Resume AI" : "Pause AI"}>
          <input type="hidden" name="key" value="AI_PAUSED" /><input type="hidden" name="value" value={String(!paused)} />
          <label className="sr-only" htmlFor="ai-r">Reason</label><input id="ai-r" name="reason" placeholder="Reason (required)" className="input max-w-xs" />
        </AdminForm>
      </div>
      <h2 className="mt-6 text-lg font-bold">Editorial roles</h2>
      <ul className="mt-2 grid gap-2 md:grid-cols-2">{roles.map((r) => <li key={r.id} className="card p-3 text-sm"><strong>{r.label}</strong> <Pill>{r.prompt_version}</Pill><br />{r.purpose} <span className="meta">Use when: {r.use_when}</span></li>)}</ul>
      <h2 className="mt-6 text-lg font-bold">Prompt versions in use</h2>
      <ul className="mt-1 text-sm">{versions.map((v) => <li key={v}><code>{v}</code></li>)}</ul>
      <div className="mt-6"><Table caption="Recent runs" head={["When", "Stage", "Role", "Provider/model", "Status", "Duration", "Tokens"]}>
        {runs.slice(0, 60).map((r) => <tr key={r.id}><td className="px-3 py-2"><Ago v={r.created} /></td><td className="px-3 py-2">{r.task_type}</td><td className="px-3 py-2">{r.role_id || "–"}</td>
          <td className="px-3 py-2">{r.provider}/{r.model}{r.is_fixture_provider ? " (fixture)" : ""}</td><td className="px-3 py-2">{r.status}{r.error_code ? ` · ${r.error_code}` : ""}</td>
          <td className="px-3 py-2">{(r.duration_ms / 1000).toFixed(1)} s</td><td className="px-3 py-2">{r.tokens_json?.input ?? "?"}/{r.tokens_json?.output ?? "?"}</td></tr>)}
      </Table></div>
    </div>
  );
}
