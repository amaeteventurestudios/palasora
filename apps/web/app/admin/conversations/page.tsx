import Link from "next/link";
import { getTenant } from "@/lib/tenant";
import { pb, q } from "@/lib/pb";
import { editorialFetch } from "@/lib/editorial-client";
import { roleLabels } from "@/lib/repo/thread";
import { getSwitch } from "@/lib/settings";
import { pauseThread, runDemoConversation, setSwitch, unpublishPiece } from "@/app/actions/admin";
import { AdminForm } from "@/components/admin/AdminForm";
import { H1, Metric, Table, Ago, Pill } from "@/components/admin/ui";

export const metadata = { title: "Conversations" };

function pct(xs: number[], p: number) { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]; }

export default async function Conversations() {
  const t = await getTenant();
  const T = `tenant_id=${q(t.id)}`;
  const day = new Date(Date.now() - 86400_000).toISOString().replace("T", " ");
  const [threads, decisions, runs, labels, stats, autoOff, events] = await Promise.all([
    pb.list("editorial_pieces", { filter: `${T} && review_status='published' && (thread_state!='')`, sort: "-last_activity_at", perPage: 50 }),
    pb.list("moderation_decisions", { filter: `${T} && created >= ${q(day)}`, sort: "-created", perPage: 300 }),
    pb.list("ai_runs", { filter: `${T} && task_type='converse' && created >= ${q(day)}`, sort: "-created", perPage: 300 }),
    roleLabels(t), editorialFetch<{ reply_budget_used_today: number; reply_budget_limit: number; converse_pending: number }>(`/conversations/stats?tenant_id=${t.id}`),
    getSwitch(t.id, "AUTO_PUBLISH_DISABLED"), pb.list("thread_events", { filter: T, sort: "-seq", perPage: 1 }),
  ]);
  const replies = decisions.filter((d) => d.scope === "reply");
  const posted = replies.filter((d) => d.decision === "allow").length;
  const abst = replies.filter((d) => d.reasons.includes("abstained")).length;
  const rejected = replies.filter((d) => d.decision === "reject" && !d.reasons.includes("abstained"));
  const real = runs.filter((r) => !r.is_fixture_provider && r.status !== "failed");
  const lat = real.map((r) => r.duration_ms);
  const reasonCounts = new Map<string, number>();
  for (const d of rejected) for (const r of String(d.reasons).split("; ")) { const k = r.split(":")[0]; reasonCounts.set(k, (reasonCounts.get(k) ?? 0) + 1); }
  return (
    <div>
      <H1 sub="AI-first threads: who replied to what, what was rejected and why, model cost. Quiet periods are normal; nothing here is simulated.">Conversations</H1>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="AI replies published" value={posted} period="Last 24 h" source="moderation_decisions (allow)" />
        <Metric label="Abstentions" value={abst} period="Last 24 h" source="Model chose not to reply" hint="Abstaining is a valid outcome" />
        <Metric label="Rejected by validator" value={rejected.length} period="Last 24 h" source={`Ruleset conv-rules-v1`} hint={[...reasonCounts].map(([k, v]) => `${k} ×${v}`).join(", ") || "none"} />
        <Metric label="Reply latency p50 / p95" value={lat.length ? `${(pct(lat, 50)! / 1000).toFixed(1)} / ${(pct(lat, 95)! / 1000).toFixed(1)}` : null} unit="s" period="Last 24 h" source="ai_runs (converse)" state={lat.length ? "ok" : "zero"} />
        <Metric label="Reply budget" value={stats?.reply_budget_used_today ?? null} unit={`/ ${stats?.reply_budget_limit ?? "?"}`} period="Today (UTC)" source="Worker quota" state={stats ? "ok" : "unknown"} hint={`${stats?.converse_pending ?? "?"} reply jobs pending`} />
        <Metric label="Auto-publication (LOW risk)" value={autoOff ? "Disabled" : "Enabled"} period="Now" source="AUTO_PUBLISH_DISABLED" hint="Sensitive and uncertain topics always go to Exceptions" />
        <Metric label="Last event sequence" value={events[0]?.seq ?? 0} period="Now" source="thread_events" hint={events[0] ? `at ${String(events[0].created).slice(0, 19)} UTC` : "no events yet"} />
      </div>
      <div className="mt-4 flex flex-wrap gap-4">
        <AdminForm action={runDemoConversation} submit="Admin: Run safe demo conversation" variant="primary" />
        <AdminForm action={setSwitch} submit={autoOff ? "Enable low-risk auto-publication" : "Disable auto-publication"}>
          <input type="hidden" name="key" value="AUTO_PUBLISH_DISABLED" /><input type="hidden" name="value" value={String(!autoOff)} />
          <label className="sr-only" htmlFor="ap-r">Reason</label><input id="ap-r" name="reason" className="input max-w-xs" placeholder="Reason (required)" />
        </AdminForm>
      </div>
      <p className="meta mt-2">The demo is a labeled, conceptual evergreen question (no current-news claims) run through the real model, the same validator and the same events.</p>
      <div className="mt-6"><Table caption="Threads" head={["Topic", "Path", "State", "AI / human", "Last activity", "Actions"]} empty="No AI threads yet.">
        {threads.map((p) => (
          <tr key={p.id}>
            <td className="px-3 py-2"><Link className="link" href={`/discussion/${p.slug}`}>{p.headline}</Link>{p.is_demo ? <span className="meta"> · demo</span> : null}</td>
            <td className="px-3 py-2"><Pill tone={p.publish_path === "auto_low_risk" ? "good" : "neutral"}>{p.publish_path || "human_review"}</Pill></td>
            <td className="px-3 py-2">{p.thread_state}</td>
            <td className="px-3 py-2">{p.ai_post_count ?? 0} / {p.human_comment_count ?? 0}</td>
            <td className="px-3 py-2"><Ago v={p.last_activity_at} /></td>
            <td className="px-3 py-2"><div className="flex flex-wrap gap-2">
              <AdminForm action={pauseThread} submit={p.thread_state === "closed" ? "Resume" : "Pause"}><input type="hidden" name="piece_id" value={p.id} /><input type="hidden" name="paused" value={String(p.thread_state !== "closed")} /></AdminForm>
              <AdminForm action={unpublishPiece} submit="Unpublish" confirm="Unpublish this topic and close its thread?"><input type="hidden" name="piece_id" value={p.id} /><input type="hidden" name="reason" value="Editor unpublished from Conversations" /></AdminForm>
            </div></td>
          </tr>))}
      </Table></div>
      <div className="mt-6"><Table caption="Recent reply decisions (validator)" head={["When", "Decision", "Reasons / rules", "Thread"]} empty="No reply decisions yet.">
        {replies.slice(0, 40).map((d) => (
          <tr key={d.id}><td className="px-3 py-2"><Ago v={d.created} /></td>
            <td className="px-3 py-2"><Pill tone={d.decision === "allow" ? "good" : d.reasons.includes("abstained") ? "neutral" : "bad"}>{d.reasons.includes("abstained") ? "abstained" : d.decision}</Pill></td>
            <td className="px-3 py-2 text-xs">{d.reasons}<br /><span className="meta">{Object.entries(d.rules ?? {}).filter(([, v]) => v === "FAIL").map(([k]) => k).join(", ")}</span></td>
            <td className="px-3 py-2 text-xs">{d.piece_id}</td></tr>))}
      </Table></div>
      <div className="mt-6"><Table caption="Model calls for replies" head={["When", "Role", "Model", "Status", "Latency", "Tokens"]}>
        {runs.slice(0, 30).map((r) => <tr key={r.id}><td className="px-3 py-2"><Ago v={r.created} /></td><td className="px-3 py-2">{labels[r.role_id] ?? r.role_id}</td>
          <td className="px-3 py-2">{r.provider}/{r.model}</td><td className="px-3 py-2">{r.status}</td><td className="px-3 py-2">{(r.duration_ms / 1000).toFixed(1)} s</td>
          <td className="px-3 py-2">{r.tokens_json?.input ?? "?"}/{r.tokens_json?.output ?? "?"}</td></tr>)}
      </Table></div>
    </div>
  );
}
