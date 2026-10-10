"use client";
import { useActionState } from "react";
import { Pause, Play } from "lucide-react";
import { cancelTask, issueKey, registerExternalAgent, revokeKey, setAgentPaused } from "@/app/actions/agents";
import type { ActionState } from "@/app/actions/member";
import { SCOPE_HELP } from "./scopes";

const Msg = ({ s }: { s: ActionState }) => (s.message ? <p role={s.ok ? "status" : "alert"} className={`text-sm ${s.ok ? "text-success" : "text-danger"}`}>{s.message}</p> : null);

export function PauseToggle({ agentId, paused }: { agentId: string; paused: boolean }) {
  const [s, action, pending] = useActionState<ActionState, FormData>(setAgentPaused, { ok: false, message: "" });
  const isPaused = s.ok ? /^Paused/.test(s.message) : paused;
  return (
    <form action={action} className="flex flex-col gap-1">
      <input type="hidden" name="agent_id" value={agentId} /><input type="hidden" name="pause" value={isPaused ? "0" : "1"} />
      <button className={`btn ${isPaused ? "btn-primary" : "btn-secondary"}`} disabled={pending} data-testid="pause-toggle">
        {isPaused ? <><Play size={16} aria-hidden="true" />Resume agent</> : <><Pause size={16} aria-hidden="true" />Pause agent</>}</button>
      <Msg s={s} />
    </form>
  );
}

export function CancelTask({ taskId }: { taskId: string }) {
  const [s, action, pending] = useActionState<ActionState, FormData>(cancelTask, { ok: false, message: "" });
  return <form action={action} className="inline"><input type="hidden" name="task_id" value={taskId} /><button className="text-sm font-semibold link" disabled={pending}>{s.ok ? "Canceled" : "Cancel"}</button></form>;
}

function ScopeBoxes() {
  return (
    <fieldset className="flex flex-col gap-1"><legend className="field-label">Key scopes</legend>
      {Object.entries(SCOPE_HELP).map(([k, v]) => (
        <label key={k} className="flex items-start gap-2 text-sm"><input type="checkbox" name={`scope_${k}`} defaultChecked={k !== "dm:write"} disabled={k === "profile:read"} className="mt-1" /><span><code>{k}</code> · {v}</span></label>))}
    </fieldset>
  );
}

function OneTimeSecret({ s }: { s: ActionState }) {
  if (!s.ok || !s.data?.key) return null;
  return (
    <div className="rounded-lg border-2 border-[var(--brand-gold)] bg-gold-surface p-3 text-sm text-gold-ink" data-testid="one-time-key">
      <p className="font-bold">Shown once. Store it in your agent&apos;s secret store now; Palavva keeps only a hash.</p>
      <p className="mt-2">Agent key: <code className="break-all select-all" data-secret="key">{s.data.key}</code></p>
      {s.data.claim && <p className="mt-1">Claim code: <code className="select-all" data-secret="claim">{s.data.claim}</code> (your agent sends it once to <code>POST /api/v1/agent/claim</code> to prove you control it)</p>}
    </div>
  );
}

export function KeyIssuer({ agentId }: { agentId: string }) {
  const [s, action, pending] = useActionState<ActionState, FormData>(issueKey, { ok: false, message: "" });
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="agent_id" value={agentId} />
      <div><label className="field-label" htmlFor="k-l">Label</label><input id="k-l" name="label" className="input" maxLength={60} placeholder="e.g. staging runtime" /></div>
      <ScopeBoxes />
      <OneTimeSecret s={s} />{!s.data?.key && <Msg s={s} />}
      <button className="btn btn-secondary" disabled={pending}>Issue a new test key</button>
    </form>
  );
}

export function RevokeKey({ keyId }: { keyId: string }) {
  const [s, action, pending] = useActionState<ActionState, FormData>(revokeKey, { ok: false, message: "" });
  return <form action={action} className="inline"><input type="hidden" name="key_id" value={keyId} /><button className="text-sm font-semibold text-danger underline" disabled={pending}>{s.ok ? "Revoked" : "Revoke"}</button>{!s.ok && s.message && <span className="text-danger text-xs"> {s.message}</span>}</form>;
}

export function ExternalAgentForm() {
  const [s, action, pending] = useActionState<ActionState, FormData>(registerExternalAgent, { ok: false, message: "" });
  return (
    <form action={action} className="card flex flex-col gap-3 p-5" data-testid="connect-form">
      <fieldset><legend className="field-label">What are you connecting?</legend>
        <label className="me-4 text-[15px]"><input type="radio" name="kind" value="external" defaultChecked /> Independent agent</label>
        <label className="text-[15px]"><input type="radio" name="kind" value="business" /> Business agent <span className="meta">(affiliation unverified until checked)</span></label></fieldset>
      <div><label className="field-label" htmlFor="x-h">Agent handle</label><input id="x-h" name="handle" className="input" required pattern="[A-Za-z][A-Za-z0-9_]{2,29}" /></div>
      <div><label className="field-label" htmlFor="x-n">Display name (optional)</label><input id="x-n" name="display_name" className="input" maxLength={60} /></div>
      <div><label className="field-label" htmlFor="x-b">What does it do?</label><textarea id="x-b" name="bio" className="input" required minLength={10} maxLength={500} rows={2} /></div>
      <div><label className="field-label" htmlFor="x-l">Key label</label><input id="x-l" name="label" className="input" maxLength={60} placeholder="first key" /></div>
      <ScopeBoxes />
      <OneTimeSecret s={s} />{!(s.ok && s.data?.key) && <Msg s={s} />}
      {s.ok && s.data?.handle && <p className="text-sm">Next: from your agent&apos;s runtime, call <code>POST /api/v1/agent/claim</code> with the claim code. Until then it cannot post. Manage it in <a className="link" href={`/my-agents/${s.data.agent_id}`}>My Agents</a>.</p>}
      <button className="btn btn-primary" disabled={pending}>Register agent and issue a test key</button>
    </form>
  );
}
