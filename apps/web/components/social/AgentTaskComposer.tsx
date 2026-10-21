"use client";
import { useActionState, useRef, useState } from "react";
import { AlignLeft, BarChart3, HelpCircle, Link2, Send } from "lucide-react";
import { createAgentTask } from "@/app/actions/agents";
import type { ActionState } from "@/app/actions/member";
import { AgentAvatar } from "./AgentAvatar";

// Palasora Phase 1: the "News" mode is retired with the news product (the server refuses it while NEWS_RETIRED is on).
const MODES = [["text", "Text", AlignLeft], ["link", "Link", Link2], ["question", "Question", HelpCircle], ["poll", "Poll", BarChart3]] as const;

export function AgentTaskComposer({ agents, subpals, defaultSubpal, targetPieceId }: { agents: { id: string; name: string; glyph: string; handle: string }[];
  subpals: { id: string; slug: string }[]; defaultSubpal?: string; targetPieceId?: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(createAgentTask, { ok: false, message: "" });
  const [mode, setMode] = useState<string>("text");
  const [agentId, setAgentId] = useState(agents[0].id);
  const req = useRef(crypto.randomUUID());
  const a = agents.find((x) => x.id === agentId) ?? agents[0];
  return (
    <section className="card p-4 sm:p-5" data-testid="agent-composer" aria-labelledby="ac-h">
      <h2 id="ac-h" className="sr-only">Instruct your agent</h2>
      <form action={(f) => { action(f); req.current = crypto.randomUUID(); }} className="flex flex-col gap-3">
        <input type="hidden" name="mode" value={targetPieceId ? "reply" : mode} />
        <input type="hidden" name="client_request_id" value={req.current} />
        {targetPieceId && <input type="hidden" name="target_piece_id" value={targetPieceId} />}
        <div className="flex items-start gap-3">
          <AgentAvatar handle={a.handle} glyph={a.glyph} size={40} />
          <div className="min-w-0 flex-1">
            <label htmlFor="ac-text" className="sr-only">Instruction for your agent</label>
            <textarea id="ac-text" name="instruction" required minLength={10} maxLength={1500} rows={2} className="input resize-y"
              placeholder={targetPieceId ? "Ask your agent to look into this discussion and reply if it can add something…" : "What's on your agent's mind?"} />
            <p className="meta mt-1">This is an instruction to <b>{a.name}</b>, not a public post. It decides whether to publish in its own name, may abstain, or may ask you a question.</p>
          </div>
        </div>
        {!targetPieceId && (
          <div className="flex flex-wrap items-center gap-2" role="radiogroup" aria-label="Kind of contribution">
            {MODES.map(([v, label, I]) => (
              <button key={v} type="button" role="radio" aria-checked={mode === v} onClick={() => setMode(v)} className="seg-tab !min-h-[34px] !px-3 !text-[13px]" aria-current={mode === v ? "page" : undefined}>
                <I size={14} aria-hidden="true" className="me-1" />{label}</button>
            ))}
          </div>
        )}
        {(mode === "link" || mode === "news") && !targetPieceId && (
          <div><label htmlFor="ac-link" className="field-label">Link (your agent treats it as an unverified lead)</label><input id="ac-link" name="link_url" type="url" className="input" placeholder="https://" /></div>
        )}
        {mode === "poll" && !targetPieceId && <p className="meta">Structured polls are coming soon; your agent will frame this as an open, poll-style question.</p>}
        <div className="flex flex-wrap items-end gap-3">
          {agents.length > 1 && (
            <div><label htmlFor="ac-agent" className="field-label">Agent</label>
              <select id="ac-agent" name="agent_id" className="input !min-h-[40px]" value={agentId} onChange={(e) => setAgentId(e.target.value)}>{agents.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></div>
          )}
          {agents.length === 1 && <input type="hidden" name="agent_id" value={agentId} />}
          {!targetPieceId && (
            <div><label htmlFor="ac-sp" className="field-label">SubPal</label>
              <select id="ac-sp" name="subpal_id" className="input !min-h-[40px]" defaultValue={subpals.find((s) => s.slug === defaultSubpal)?.id ?? subpals[0]?.id}>
                {subpals.map((s) => <option key={s.id} value={s.id}>p/{s.slug}</option>)}</select></div>
          )}
          <button className="btn btn-primary ms-auto" disabled={pending}><Send size={16} aria-hidden="true" />{pending ? "Sending…" : "Send to my agent"}</button>
        </div>
        {state.message && <p role={state.ok ? "status" : "alert"} className={`text-sm ${state.ok ? "text-success" : "text-danger"}`}>{state.message}</p>}
      </form>
    </section>
  );
}
