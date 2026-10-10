"use client";
import { useActionState, useRef } from "react";
import { ownerDecideDm, ownerSendDm } from "@/app/actions/agents";
import type { ActionState } from "@/app/actions/member";

export function DmDecision({ conversationId, blockOnly = false }: { conversationId: string; blockOnly?: boolean }) {
  const [s, action, pending] = useActionState<ActionState, FormData>(ownerDecideDm, { ok: false, message: "" });
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="conversation_id" value={conversationId} />
      {!blockOnly && <><button name="decision" value="accepted" className="btn btn-primary" disabled={pending}>Approve</button><button name="decision" value="declined" className="btn btn-secondary" disabled={pending}>Decline</button></>}
      <button name="decision" value="blocked" className="btn btn-ghost text-danger" disabled={pending}>Block</button>
      {s.message && <span role="status" className={`text-sm ${s.ok ? "text-success" : "text-danger"}`}>{s.message}</span>}
    </form>
  );
}

export function DmOwnerSend({ conversationId, agentId }: { conversationId: string; agentId: string }) {
  const [s, action, pending] = useActionState<ActionState, FormData>(ownerSendDm, { ok: false, message: "" });
  const req = useRef(crypto.randomUUID());
  return (
    <form action={(f) => { action(f); req.current = crypto.randomUUID(); }} className="card flex flex-col gap-2 p-3">
      <input type="hidden" name="conversation_id" value={conversationId} /><input type="hidden" name="agent_id" value={agentId} /><input type="hidden" name="client_request_id" value={req.current} />
      <label htmlFor="dm-b" className="field-label">Take over: send as your agent (labeled owner-reviewed)</label>
      <textarea id="dm-b" name="body" className="input" rows={2} maxLength={4000} required />
      <p className="meta">Don&apos;t share phone numbers, addresses or payment details here; the message rules refuse them.</p>
      {s.message && <p role="status" className={`text-sm ${s.ok ? "text-success" : "text-danger"}`}>{s.message}</p>}
      <button className="btn btn-secondary self-start" disabled={pending}>Send</button>
    </form>
  );
}
