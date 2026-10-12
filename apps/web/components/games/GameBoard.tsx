"use client";
// ISSUE-28 live board for players and spectators. Polls the match every 1.5 s while it is live (agent turns are played server-side
// on that read), sends a player's move with the ply it was made on, and shows the server's answer (illegal move, not your turn...).
// Keyboard: every playable pit/square/answer is a button. Screen readers get a live status line.
import { useCallback, useEffect, useRef, useState } from "react";
import type { MatchView } from "@/lib/games/view";
import { cn } from "@/lib/utils";

const rc = (i: number): [number, number] => { const r = Math.floor(i / 4); return [r, (i % 4) * 2 + (r % 2 === 0 ? 1 : 0)]; };

export function GameBoard({ initial }: { initial: MatchView }) {
  const [v, setV] = useState(initial);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [sel, setSel] = useState<number | null>(null);
  const live = v.status === "active" && !v.replaying;
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const refresh = useCallback(async () => {
    const r = await fetch(`/api/v1/games/matches/${v.id}`, { cache: "no-store" }).catch(() => null);
    if (r?.ok) setV(await r.json());
  }, [v.id]);
  useEffect(() => {
    if (!live) return;
    timer.current = setInterval(refresh, 1500);
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [live, refresh]);
  const myTurn = v.yourSide !== null && v.waitingOn.includes(v.yourSide);
  const send = async (move: unknown) => {
    setBusy(true); setMsg("");
    const r = await fetch(`/api/v1/games/matches/${v.id}/move`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ move, ply: v.movesCount }) });
    const j = await r.json().catch(() => null);
    if (r.ok) setV(j); else { setMsg(j?.error?.message ?? "That did not work."); await refresh(); }
    setSel(null); setBusy(false);
  };
  const [a, b] = v.players;
  const status = v.replaying ? `Replay at move ${v.ply} of ${v.movesCount}.` : v.status === "finished" ? `Finished: ${v.winner === "draw" ? "a draw" : `${(v.winner === "a" ? a : b).name} won`} (${v.score}). ${v.reason}.`
    : v.status === "cancelled" ? `Cancelled by Palavva staff: ${v.reason}`
    : myTurn ? "Your turn." : v.waitingOn.length ? `Waiting for ${v.waitingOn.map((s) => (s === 0 ? a : b).name).join(" and ")}…` : "…";

  return (
    <div className="flex flex-col gap-3" data-testid="game-board" data-status={v.status} data-ply={v.movesCount}>
      <p role="status" aria-live="polite" className="font-semibold" data-testid="game-status">{status}</p>
      {msg && <p role="alert" className="text-sm text-danger" data-testid="game-error">{msg}</p>}
      {v.game === "oware" && <Oware v={v} enabled={myTurn && !busy} onMove={send} />}
      {v.game === "checkers" && <Checkers v={v} enabled={myTurn && !busy} sel={sel} setSel={setSel} onMove={send} />}
      {v.game === "trivia" && <Trivia v={v} enabled={myTurn && !busy} onMove={send} />}
    </div>
  );
}

function Oware({ v, enabled, onMove }: { v: MatchView; enabled: boolean; onMove: (m: number) => void }) {
  const b = v.board as { pits: number[]; store: number[] };
  const pit = (i: number) => {
    const can = enabled && v.legal.includes(i);
    return <button key={i} type="button" disabled={!can} onClick={() => onMove(i)} data-testid={`pit-${i}`} aria-label={`Pit ${i < 6 ? i + 1 : i - 5} on ${i < 6 ? v.players[0].name : v.players[1].name}'s side: ${b.pits[i]} seeds${can ? ", playable" : ""}`}
      className={cn("flex size-12 items-center justify-center rounded-full border-2 text-lg font-bold tabular-nums sm:size-16", can ? "border-[var(--brand-tangerine)] bg-card hover:bg-accent" : "border-border bg-card-muted")}>{b.pits[i]}</button>;
  };
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border bg-[color-mix(in_oklab,var(--brand-gold)_18%,var(--card))] p-3" data-testid="oware-board">
      <p className="text-sm">{v.players[1].name}: <b data-testid="store-b">{b.store[1]}</b> captured</p>
      <div className="flex gap-1.5 sm:gap-2">{[11, 10, 9, 8, 7, 6].map(pit)}</div>
      <div className="flex gap-1.5 sm:gap-2">{[0, 1, 2, 3, 4, 5].map(pit)}</div>
      <p className="text-sm">{v.players[0].name}: <b data-testid="store-a">{b.store[0]}</b> captured</p>
      <p className="text-xs text-muted-foreground">Seeds move anticlockwise: along the bottom row to the right, then along the top row to the left.</p>
    </div>
  );
}

function Checkers({ v, enabled, sel, setSel, onMove }: { v: MatchView; enabled: boolean; sel: number | null; setSel: (n: number | null) => void; onMove: (m: number[]) => void }) {
  const board = (v.board as { board: number[] }).board;
  const legal = v.legal as number[][];
  const at: Record<string, number> = {};
  board.forEach((_, i) => { const [r, c] = rc(i); at[`${r},${c}`] = i; });
  const froms = new Set(legal.map((m) => m[0]));
  const targets = sel === null ? new Map<number, number[]>() : new Map(legal.filter((m) => m[0] === sel).map((m) => [m[m.length - 1], m]));
  return (
    <div className="grid w-full max-w-[28rem] grid-cols-8 overflow-hidden rounded-xl border" data-testid="checkers-board" role="grid" aria-label="Checkers board">
      {Array.from({ length: 64 }, (_, k) => {
        const r = Math.floor(k / 8), c = k % 8, i = at[`${r},${c}`];
        const dark = i !== undefined, p = dark ? board[i] : 0;
        const canFrom = enabled && dark && froms.has(i), canTo = enabled && dark && targets.has(i);
        return (
          <button key={k} type="button" disabled={!(canFrom || canTo)} data-testid={dark ? `sq-${i}` : undefined}
            onClick={() => (canTo ? onMove(targets.get(i)!) : setSel(sel === i ? null : i))}
            aria-label={dark ? `Square ${i}${p ? `, ${p > 0 ? v.players[0].name : v.players[1].name} ${Math.abs(p) === 2 ? "king" : "piece"}` : ", empty"}${canFrom ? ", can move" : ""}${canTo ? ", move here" : ""}` : "light square"}
            className={cn("flex aspect-square items-center justify-center", dark ? "bg-[var(--brand-midnight,#1B2030)]" : "bg-[#F8F5F0]", sel === i && "ring-2 ring-inset ring-[var(--brand-gold)]", canTo && "bg-[color-mix(in_oklab,var(--brand-tangerine)_45%,#1B2030)]")}>
            {p !== 0 && <span className={cn("flex size-[70%] items-center justify-center rounded-full border-2 text-xs font-black", p > 0 ? "border-[var(--brand-tangerine)] bg-[var(--brand-tangerine)] text-white" : "border-[var(--brand-gold)] bg-[#F8F5F0] text-[#1B2030]")}>{Math.abs(p) === 2 ? "K" : ""}</span>}
          </button>);
      })}
    </div>
  );
}

function Trivia({ v, enabled, onMove }: { v: MatchView; enabled: boolean; onMove: (m: number) => void }) {
  const t = v.trivia!;
  return (
    <div className="flex flex-col gap-3" data-testid="trivia-board">
      <p className="text-sm">Score: {v.players[0].name} <b>{t.score[0]}</b> – <b>{t.score[1]}</b> {v.players[1].name} · question {Math.min(t.round + 1, t.total)} of {t.total}</p>
      {t.current && <div className="rounded-xl border p-4"><p className="text-xs uppercase tracking-wide text-muted-foreground">{t.current.topic}</p>
        <p className="mt-1 text-lg font-bold" data-testid="trivia-question">{t.current.q}</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">{t.current.options.map((o) => <button key={o.index} type="button" disabled={!enabled} onClick={() => onMove(o.index)}
          className="btn btn-secondary justify-start text-start" data-testid={`answer-${o.index}`}>{o.text}</button>)}</div>
        {!enabled && v.yourSide !== null && v.status === "active" && <p className="mt-2 text-sm text-muted-foreground">Answer saved. Waiting for the other player; their answer stays hidden until you both answer.</p>}</div>}
      {t.rounds.length > 0 && <details className="rounded-xl border p-3" open={v.status !== "active"}><summary className="cursor-pointer font-semibold">Answered questions and sources ({t.rounds.length})</summary>
        <ol className="mt-2 flex flex-col gap-2 text-sm">{t.rounds.map((r, i) => <li key={i}><b>{r.q}</b> Answer: {r.options[r.answer]}. {v.players[0].name}: {r.picks[0] === null ? "—" : r.options[r.picks[0]]} {r.picks[0] === r.answer ? "✓" : "✗"} ·
          {" "}{v.players[1].name}: {r.picks[1] === null ? "—" : r.options[r.picks[1]]} {r.picks[1] === r.answer ? "✓" : "✗"} · <a className="link" href={r.source} rel="noopener noreferrer" target="_blank">source</a>{r.note ? ` (${r.note})` : ""}</li>)}</ol></details>}
    </div>
  );
}
