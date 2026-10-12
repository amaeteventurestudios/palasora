// ISSUE-28 one interface over the three deterministic games, plus agent "strategy", Elo ratings and persona banter.
// No model call is ever made for a move: agents play through cheap search/accuracy settings derived from their stored personality
// (risk profile + communication DNA). Banter is chosen from short templates by temperament and states only facts from the match.
import { createHash } from "node:crypto";
import { checkersApply, checkersBest, checkersInitial, checkersMoves, type CheckersMove, type CheckersState } from "./checkers";
import { owareApply, owareBest, owareInitial, owareMoves, type OwareState } from "./oware";
import { triviaApply, triviaBot, triviaInitial, type TriviaState } from "./trivia";

export const GAMES = {
  oware: { key: "oware", name: "Ayo / Oware", short: "Oware", blurb: "The classic West African sowing game: 12 pits, 48 seeds, capture 2s and 3s. Played with the international abapa rules.", players: "2", turnBased: true },
  checkers: { key: "checkers", name: "Checkers (draughts)", short: "Checkers", blurb: "English draughts on an 8×8 board. Captures are compulsory; reach the far side to crown a king.", players: "2", turnBased: true },
  trivia: { key: "trivia", name: "Africa Trivia", short: "Trivia", blurb: "Ten questions on African geography, history, science and culture. Every answer links to its public source.", players: "2", turnBased: false },
} as const;
export type GameKey = keyof typeof GAMES;
export const GAME_KEYS = Object.keys(GAMES) as GameKey[];
export const RULESET = { oware: "oware-abapa-v1", checkers: "checkers-english-v1", trivia: "trivia-bank-2026-10" } as const;
export type Side = 0 | 1;
export type AnyState = (OwareState | CheckersState | TriviaState) & { toMove: Side; over: boolean; winner: Side | "draw" | null; reason: string; ply: number };

export function initial(game: GameKey, seed: number): AnyState {
  return (game === "oware" ? owareInitial() : game === "checkers" ? checkersInitial() : triviaInitial(seed)) as AnyState;
}
/** Applies a move for `side`. Throws ILLEGAL_MOVE / NOT_YOUR_TURN; never mutates the input. */
export function apply(game: GameKey, s: AnyState, side: Side, move: unknown): AnyState {
  if (s.over) throw new Error("GAME_OVER");
  if (game === "trivia") return triviaApply(s as TriviaState, side, Number(move)) as AnyState;
  if (s.toMove !== side) throw new Error("NOT_YOUR_TURN");
  if (game === "oware") return owareApply(s as OwareState, Number(move)) as AnyState;
  return checkersApply(s as CheckersState, move as CheckersMove) as AnyState;
}
export function legal(game: GameKey, s: AnyState, side: Side): unknown[] {
  if (s.over) return [];
  if (game === "trivia") { const t = s as TriviaState; return t.answers[side][t.round] !== null ? [] : [0, 1, 2, 3]; }
  if (s.toMove !== side) return [];
  return game === "oware" ? owareMoves(s as OwareState) : checkersMoves(s as CheckersState);
}
/** Whose input the match is waiting for (trivia: anyone who has not answered this round). */
export function waitingOn(game: GameKey, s: AnyState): Side[] {
  if (s.over) return [];
  if (game !== "trivia") return [s.toMove];
  const t = s as TriviaState;
  return ([0, 1] as Side[]).filter((x) => t.answers[x][t.round] === null);
}

// ---------------------------------------------------------------- agent play style (deterministic, explainable)
export type Dna = { temperament?: string; humor?: string; sarcasm?: number; skepticism?: number; emoji?: string; emoji_set?: string; verbosity?: string };
export type AgentLike = { id: string; handle: string; display_name?: string; risk_profile?: string; primary_subjects?: unknown; activity_propensity?: number };
export const seedOf = (s: string) => parseInt(createHash("sha256").update(s).digest("hex").slice(0, 8), 16);

export function playStyle(a: AgentLike, dna: Dna | null): { depth: number; salt: number; tie: number[]; skill: Record<string, number>; label: string } {
  const h = seedOf(`style|${a.id}`);
  const risk = String(a.risk_profile ?? "balanced");
  const careful = dna?.temperament === "measured" || dna?.temperament === "skeptical" || (dna?.skepticism ?? 0) >= 3;
  const depth = Math.min(6, Math.max(2, 3 + (careful ? 1 : 0) + (risk === "cautious" ? 1 : 0) - (risk === "aggressive" || dna?.temperament === "impatient" ? 1 : 0) + (h % 2)));
  const tie = [0, 1, 2, 3, 4, 5].sort((x, y) => seedOf(`${a.id}|${x}`) - seedOf(`${a.id}|${y}`));
  const subj = (Array.isArray(a.primary_subjects) ? a.primary_subjects : []).map(String).join(" ");
  const base = 0.5 + (h % 15) / 100;
  const skill = { geography: base + (/travel|geograph|climate|agri|environment/.test(subj) ? 0.2 : 0), history: base + (/history|politic|culture/.test(subj) ? 0.2 : 0),
    science: base + (/science|tech|health|energy/.test(subj) ? 0.2 : 0), culture: base + (/music|film|food|culture|entertain|football|sport/.test(subj) ? 0.2 : 0) };
  const label = `${depth <= 3 ? "quick, instinctive" : depth >= 5 ? "patient, calculating" : "steady"} player (looks ${depth} moves ahead)`;
  return { depth, salt: h % 13, tie, skill, label };
}

export function botMove(game: GameKey, s: AnyState, side: Side, a: AgentLike, dna: Dna | null): unknown {
  const st = playStyle(a, dna);
  if (game === "trivia") return triviaBot(s as TriviaState, seedOf(a.id), st.skill);
  if (game === "oware") return owareBest(s as OwareState, Math.min(st.depth + 1, 7), st.tie);
  return checkersBest(s as CheckersState, Math.min(st.depth, 5), st.salt);
}

// ---------------------------------------------------------------- Elo (per game; agents and humans keep separate tables)
export const ELO_START = 1200;
export function elo(ra: number, rb: number, scoreA: 1 | 0.5 | 0, games: [number, number]): [number, number] {
  const k = (g: number) => (g < 20 ? 32 : 16);
  const ea = 1 / (1 + 10 ** ((rb - ra) / 400));
  return [Math.round(ra + k(games[0]) * (scoreA - ea)), Math.round(rb + k(games[1]) * (1 - scoreA - (1 - ea)))];
}

// ---------------------------------------------------------------- persona banter (templates; only facts from the match)
const LINES: Record<string, { pre: string[]; win: string[]; lose: string[]; draw: string[] }> = {
  warm: { pre: ["Good luck, {opp}. Let's make it a good one.", "Happy to play you, {opp}."], win: ["Well played, {opp}. That was close in places.", "Thanks for the game, {opp}. {score}."], lose: ["You earned that, {opp}. {score}.", "Lovely game, {opp}. I'll study that one."], draw: ["A draw feels right, {opp}.", "Even all the way. Good game, {opp}."] },
  enthusiastic: { pre: ["Let's go, {opp}!", "Been waiting for this one, {opp}!"], win: ["Yes! {score}. What a game, {opp}!", "That last stretch was fun. {score}!"], lose: ["Ah! {opp} had it today. {score}.", "Great game anyway! {score}."], draw: ["A draw! Rematch soon, {opp}?", "Dead even. Love it."] },
  skeptical: { pre: ["Let's see if the opening holds up, {opp}.", "We'll see, {opp}."], win: ["{score}. The numbers don't lie.", "Won it, {score}. I'll still check where I was lucky."], lose: ["{score}. I'll want to look at that game again.", "Fair result, {opp}. {score}."], draw: ["A draw. Neither of us proved much.", "Level. Inconclusive, as expected."] },
  blunt: { pre: ["Your move, {opp}.", "Ready."], win: ["{score}. Done.", "Won. {score}."], lose: ["Lost. {score}. Next.", "{opp} played better. {score}."], draw: ["Draw.", "Level. Fine."] },
  curious: { pre: ["Curious what you'll open with, {opp}.", "Let's see your plan, {opp}."], win: ["{score}. What were you aiming for in the middle, {opp}?", "Won it, {score}. Interesting game."], lose: ["{score}. How did you see that capture coming, {opp}?", "You got me, {opp}. {score}."], draw: ["A draw. I wonder who was actually ahead.", "Level. Interesting, {opp}."] },
  dry: { pre: ["Well. Here we go.", "Another game, {opp}."], win: ["{score}. That went according to plan, for once.", "Won. Nobody is more surprised than me."], lose: ["{score}. That went about as well as the forecast.", "Lost. Noted."], draw: ["A draw. Thrilling.", "Level. As planned, obviously."] },
  measured: { pre: ["Good luck, {opp}.", "Let's play carefully."], win: ["{score}. A steady game.", "Won, {score}. The middle game decided it."], lose: ["{score}. {opp} was more precise.", "Lost, {score}. Worth reviewing."], draw: ["A fair draw.", "Even result, {opp}."] },
  wry: { pre: ["May the seeds be kind, {opp}.", "Let's pretend I have a plan, {opp}."], win: ["{score}. I'll take it before anyone checks.", "Won. Even I'm not sure how."], lose: ["{score}. {opp} read me like a newspaper.", "Lost. At least it was entertaining."], draw: ["A draw. Diplomacy wins again.", "Level. Everyone goes home happy-ish."] },
  optimistic: { pre: ["This will be a good one, {opp}.", "Fresh board, fresh chances."], win: ["{score}! Good game, {opp}.", "Won it. Felt good."], lose: ["{score}. Next one's mine, {opp}.", "Lost, but I learned something."], draw: ["A draw. Both of us can build on that.", "Level. Next time!"] },
  impatient: { pre: ["Let's get on with it, {opp}.", "Move fast, {opp}."], win: ["{score}. Next.", "Won. Quick enough."], lose: ["{score}. Fine. Rematch.", "Lost. Again, then."], draw: ["Draw. Rematch.", "Level. Let's settle it."] },
};
export function banter(kind: "pre" | "win" | "lose" | "draw", me: AgentLike, dna: Dna | null, opp: string, score: string, key: string): string {
  const set = LINES[dna?.temperament ?? ""] ?? LINES.measured;
  const opts = set[kind];
  const h = seedOf(`${me.id}|${key}|${kind}`);
  let line = opts[h % opts.length].replace(/\{opp\}/g, opp).replace(/\{score\}/g, score);
  const rate = dna?.emoji === "sometimes" ? 0.3 : dna?.emoji === "rare" ? 0.12 : 0;
  const emojis = String(dna?.emoji_set ?? "").split(/\s+/).filter(Boolean);
  if (emojis.length && (h % 1000) / 1000 < rate) line += ` ${emojis[h % emojis.length]}`;
  return line;
}
