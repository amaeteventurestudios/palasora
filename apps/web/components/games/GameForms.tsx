"use client";
import { useActionState } from "react";
import { answer, challengePerson, playAgent } from "@/app/actions/games";
import type { ActionState } from "@/app/actions/member";

const init: ActionState = { ok: false, message: "" };
const Msg = ({ s }: { s: ActionState }) => (s.message ? <p role="status" className={`text-sm ${s.ok ? "text-success" : "text-danger"}`}>{s.message}</p> : null);
const GAMES = [["oware", "Ayo / Oware"], ["checkers", "Checkers"], ["trivia", "Africa Trivia"]] as const;

export function PlayAgentForm({ agent, defaultGame = "oware", compact = false }: { agent?: string; defaultGame?: string; compact?: boolean }) {
  const [s, a, p] = useActionState(playAgent, init);
  return (
    <form action={a} className="flex flex-wrap items-end gap-2" data-testid="play-agent-form">
      {agent && <input type="hidden" name="agent" value={agent} />}
      <label className="flex flex-col text-sm">Game<select name="game" defaultValue={defaultGame} className="h-10 rounded-md border bg-background px-2" data-testid="play-game">{GAMES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
      {!compact && <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="public" value="off" className="h-4 w-4" />Keep this match private</label>}
      <button className="btn btn-primary" disabled={p} data-testid="play-agent">{p ? "Starting…" : agent ? `Play @${agent}` : "Play an agent"}</button>
      <Msg s={s} />
    </form>
  );
}
export function ChallengeForm() {
  const [s, a, p] = useActionState(challengePerson, init);
  return (
    <form action={a} className="flex flex-wrap items-end gap-2" data-testid="challenge-form">
      <label className="flex flex-col text-sm">Person's handle<input name="handle" placeholder="@handle" className="h-10 rounded-md border bg-background px-2" /></label>
      <label className="flex flex-col text-sm">Game<select name="game" className="h-10 rounded-md border bg-background px-2">{GAMES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
      <button className="btn btn-secondary" disabled={p}>{p ? "Sending…" : "Send challenge"}</button>
      <Msg s={s} />
    </form>
  );
}
export function AnswerChallenge({ id, incoming }: { id: string; incoming: boolean }) {
  // Two forms with a hidden value each: the clicked button's own name/value is not reliably part of an action's FormData.
  const [s, a, p] = useActionState(answer, init);
  return (
    <div className="flex flex-wrap items-center gap-2">
      {incoming && <form action={a}><input type="hidden" name="id" value={id} /><input type="hidden" name="accept" value="1" />
        <button className="btn btn-primary !min-h-[36px] text-sm" disabled={p} data-testid={`accept-${id}`}>Accept and play</button></form>}
      <form action={a}><input type="hidden" name="id" value={id} /><input type="hidden" name="accept" value="0" />
        <button className="btn btn-secondary !min-h-[36px] text-sm" disabled={p}>{incoming ? "Decline" : "Cancel"}</button></form>
      <Msg s={s} />
    </div>
  );
}
