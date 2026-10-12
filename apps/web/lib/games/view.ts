// ISSUE-28 what a viewer may see of a match. Spectators and players get the same board; a trivia opponent's answer for the current
// round stays hidden until both have answered, and correct answers are revealed only for finished rounds.
import type { Rec } from "../pb";
import type { Tenant } from "../tenant";
import { GAMES, apply, initial, legal, waitingOn, type AnyState, type GameKey, type Side } from "./engine";
import { question, type TriviaState } from "./trivia";
import { humanSide, players, scoreLine, type Player } from "./server";

export type TriviaView = { round: number; total: number; current: { id: string; q: string; topic: string; options: { index: number; text: string }[] } | null;
  rounds: { q: string; options: string[]; answer: number; source: string; note?: string; picks: [number | null, number | null] }[]; score: [number, number] };
export type MatchView = { id: string; game: GameKey; gameName: string; mode: string; status: string; players: [Player, Player]; yourSide: Side | null; waitingOn: Side[]; legal: unknown[];
  ply: number; movesCount: number; replaying: boolean; board: unknown; trivia?: TriviaView; winner: string; reason: string; score: string; commentary: { ply: number; agent_id: string; kind: string; text: string }[];
  ratings: Record<string, { before: number; after: number }>; isPublic: boolean; startedAt: string; finishedAt: string; tournamentId: string; resultPostId: string };

function triviaView(s: TriviaState): TriviaView {
  const done = s.qids.slice(0, s.round).map((id, i) => { const q = question(id); return { q: q.q, options: q.options, answer: q.answer, source: q.source, note: q.note, picks: [s.answers[0][i], s.answers[1][i]] as [number | null, number | null] }; });
  const cur = !s.over && s.round < s.qids.length ? question(s.qids[s.round]) : null;
  return { round: s.round, total: s.qids.length, score: s.score, rounds: done,
    current: cur ? { id: cur.id, q: cur.q, topic: cur.topic, options: s.order[s.round].map((i) => ({ index: i, text: cur.options[i] })) } : null };
}

/** Board state at `ply` (replay) by re-applying the committed moves from the match's seed. */
export function stateAt(m: Rec, moves: Rec[], ply: number): AnyState {
  const game = m.game as GameKey;
  let s = initial(game, Number(m.seed));
  for (const mv of moves.slice(0, ply)) s = apply(game, s, mv.side as Side, mv.move);
  return s;
}

export async function matchView(t: Tenant, m: Rec, viewerId: string | undefined, opts: { ply?: number; moves?: Rec[] } = {}): Promise<MatchView> {
  const game = m.game as GameKey;
  const replaying = opts.ply !== undefined && opts.moves !== undefined && opts.ply < Number(m.moves_count);
  const s = replaying ? stateAt(m, opts.moves!, opts.ply!) : (m.state as AnyState);
  const yourSide = humanSide(m, viewerId);
  const wait = m.status === "active" && !replaying ? waitingOn(game, s) : [];
  let board: unknown = null, trivia: TriviaView | undefined;
  if (game === "trivia") trivia = triviaView(s as TriviaState);
  else board = game === "oware" ? { pits: (s as unknown as { pits: number[] }).pits, store: (s as unknown as { store: number[] }).store } : { board: (s as unknown as { board: number[] }).board };
  return {
    id: m.id, game, gameName: GAMES[game].name, mode: m.mode, status: m.status, players: await players(t, m), yourSide, waitingOn: wait,
    legal: yourSide !== null && wait.includes(yourSide) ? legal(game, s, yourSide) : [], ply: replaying ? opts.ply! : Number(m.moves_count), movesCount: Number(m.moves_count), replaying,
    board, trivia, winner: m.winner ?? "", reason: String((m.status === "cancelled" ? m.cancel_reason : m.result_reason) || ""), score: scoreLine(game, s),
    commentary: Array.isArray(m.commentary) ? m.commentary : [], ratings: (m.ratings ?? {}) as MatchView["ratings"], isPublic: !!m.public,
    startedAt: String(m.started_at ?? ""), finishedAt: String(m.finished_at ?? ""), tournamentId: m.tournament_id ?? "", resultPostId: m.result_post_id ?? "",
  };
}

/** Private matches are visible only to their two players (and staff with Games → view, checked by the caller). */
export const canSee = (m: Rec, viewerId: string | undefined) => !!m.public || humanSide(m, viewerId) !== null;
