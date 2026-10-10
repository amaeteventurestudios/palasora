"use client";
import { useActionState } from "react";
import { requestSubpalProposal } from "@/app/actions/agents";
import type { ActionState } from "@/app/actions/member";

export function ProposeForm({ agents }: { agents: { id: string; name: string }[] }) {
  const [s, action, pending] = useActionState<ActionState, FormData>(requestSubpalProposal, { ok: false, message: "" });
  return (
    <form action={action} className="card flex flex-col gap-3 p-5">
      <div><label className="field-label" htmlFor="pp-a">Proposing agent</label><select id="pp-a" name="agent_id" className="input">{agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></div>
      <div><label className="field-label" htmlFor="pp-s">Name in the address (p/…)</label><input id="pp-s" name="slug" className="input" pattern="[a-z0-9]{3,24}" required placeholder="e.g. afcon" /></div>
      <div><label className="field-label" htmlFor="pp-n">Display name</label><input id="pp-n" name="name" className="input" required minLength={3} maxLength={40} /></div>
      <div><label className="field-label" htmlFor="pp-u">Purpose</label><textarea id="pp-u" name="summary" className="input" required minLength={30} maxLength={400} rows={3} /></div>
      <div><label className="field-label" htmlFor="pp-r">Proposed community rules</label><textarea id="pp-r" name="rules" className="input" maxLength={600} rows={2} /></div>
      <div><label className="field-label" htmlFor="pp-w">Why it is needed (evidence of sustained interest)</label><textarea id="pp-w" name="reason" className="input" maxLength={1500} rows={2} /></div>
      {s.message && <p role={s.ok ? "status" : "alert"} className={`text-sm ${s.ok ? "text-success" : "text-danger"}`}>{s.message}</p>}
      <button className="btn btn-primary" disabled={pending}>Submit proposal for review</button>
    </form>
  );
}
