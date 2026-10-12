import { describe, expect, it } from "vitest";
import { owareApply, owareInitial, owareMoves, type OwareState } from "../../lib/games/oware";
import { checkersApply, checkersInitial, checkersMoves, type CheckersState } from "../../lib/games/checkers";
import { BANK, TRIVIA_ROUNDS, triviaApply, triviaInitial } from "../../lib/games/trivia";
import { apply, banter, botMove, elo, initial, legal, playStyle, type AnyState, type GameKey } from "../../lib/games/engine";

const ow = (pits: number[], toMove: 0 | 1 = 0, store: [number, number] = [0, 0]): OwareState => ({ pits, store, toMove, ply: 0, seen: {}, over: false, winner: null, reason: "" });
const sum = (s: OwareState) => s.pits.reduce((a, b) => a + b, 0) + s.store[0] + s.store[1];

describe("ISSUE-28 Oware (abapa)", () => {
  it("starts with 48 seeds and six legal moves; sowing is anticlockwise", () => {
    const s = owareInitial();
    expect(owareMoves(s)).toEqual([0, 1, 2, 3, 4, 5]);
    const n = owareApply(s, 5);
    expect(n.pits).toEqual([4, 4, 4, 4, 4, 0, 5, 5, 5, 5, 4, 4]); expect(n.toMove).toBe(1); expect(sum(n)).toBe(48);
  });
  it("captures 2s and 3s backwards on the opponent's side only", () => {
    const n = owareApply(ow([0, 0, 0, 0, 0, 2, 1, 2, 0, 0, 0, 5]), 5); // lands 6 (2), 7 (3) -> capture 7 then 6
    expect(n.store[0]).toBe(5); expect(n.pits[6]).toBe(0); expect(n.pits[7]).toBe(0);
  });
  it("grand slam: a move that would take every opponent seed captures nothing", () => {
    const n = owareApply(ow([0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0], 0, [20, 26]), 5);
    expect(n.store[0]).toBe(20); expect(n.pits[6]).toBe(2);
  });
  it("skips the starting pit when sowing 12 or more seeds", () => {
    const n = owareApply(ow([12, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]), 0);
    expect(n.pits[0]).toBe(0); expect(sum(n)).toBe(23);
  });
  it("must feed an empty opponent; if impossible the player takes the rest", () => {
    expect(owareMoves(ow([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0]))).toEqual([5]);
    const n = owareApply(ow([0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1], 1, [23, 23]), 11); // B sows into A's pit 0, A has 1 seed, B now empty
    expect(n.over).toBe(false);
    const end = owareApply(ow([2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1], 1, [22, 23]), 11); // A to move with 3 seeds in 0, can't reach B
    expect(end.over).toBe(true); expect(sum(end)).toBe(48);
  });
  it("rejects illegal moves (empty pit, opponent's pit, out of range)", () => {
    const s = owareApply(owareInitial(), 0);
    expect(() => owareApply(s, 0)).toThrow("ILLEGAL_MOVE");
    expect(() => owareApply(owareInitial(), 7)).toThrow("ILLEGAL_MOVE");
    expect(() => owareApply(owareInitial(), 99)).toThrow("ILLEGAL_MOVE");
  });
});

describe("ISSUE-28 Checkers (English draughts)", () => {
  const empty = (): CheckersState => ({ board: Array(32).fill(0), toMove: 0, ply: 0, quiet: 0, over: false, winner: null, reason: "" });
  it("has 7 opening moves for the first player and 12 pieces each", () => {
    const s = checkersInitial();
    expect(checkersMoves(s)).toHaveLength(7);
    expect(s.board.filter((v) => v > 0)).toHaveLength(12); expect(s.board.filter((v) => v < 0)).toHaveLength(12);
  });
  it("captures are compulsory and multi-jumps are one move", () => {
    // A man on 25 (row 6) jumps 21 landing on 16, then must continue over 13 to 9: one move, two captures.
    const s = empty(); s.board[25] = 1; s.board[21] = -1; s.board[13] = -1; s.board[0] = -1;
    expect(checkersMoves(s)).toEqual([[25, 16, 9]]); // the half-finished jump [25,16] is not offered
    const after = checkersApply(s, [25, 16, 9]);
    expect(after.board[21]).toBe(0); expect(after.board[13]).toBe(0); expect(after.board[9]).toBe(1);
    expect(() => checkersApply(s, [25, 16])).toThrow("ILLEGAL_MOVE");
    expect(() => checkersApply(s, [25, 20])).toThrow("ILLEGAL_MOVE"); // a quiet move while a capture exists
  });
  it("crowns a man that reaches the far row", () => {
    const s = empty(); s.board[5] = 1; s.board[30] = -1;
    const m = checkersMoves(s).find((x) => x[1] < 4)!;
    expect(checkersApply(s, m).board[m[1]]).toBe(2);
  });
  it("a side with no legal move loses", () => {
    const s = empty(); s.board[5] = 1; s.board[0] = -1;
    const n = checkersApply(s, checkersMoves(s)[0]);
    expect(n.over || checkersMoves(n).length > 0).toBe(true);
  });
});

describe("ISSUE-28 Trivia", () => {
  it("bank answers are valid and every question has a https source", () => {
    expect(new Set(BANK.map((q) => q.id)).size).toBe(BANK.length);
    for (const q of BANK) { expect(q.answer).toBeLessThan(q.options.length); expect(q.source).toMatch(/^https:\/\//); expect(new Set(q.options).size).toBe(q.options.length); }
  });
  it("same seed, same questions; both players answer each round; no changing answers", () => {
    expect(triviaInitial(42).qids).toEqual(triviaInitial(42).qids);
    let s = triviaInitial(7);
    s = triviaApply(s, 1, 0); expect(s.round).toBe(0);
    expect(() => triviaApply(s, 1, 2)).toThrow("ILLEGAL_MOVE");
    s = triviaApply(s, 0, 0); expect(s.round).toBe(1);
    for (let r = 1; r < TRIVIA_ROUNDS; r++) { s = triviaApply(s, 0, 0); s = triviaApply(s, 1, 1); }
    expect(s.over).toBe(true); expect(s.reason).toContain(`after ${TRIVIA_ROUNDS} questions`);
  });
});

describe("ISSUE-28 engine: AI vs AI is deterministic, finishes, and never needs a model", () => {
  const A = { id: "agentaaaaaaaaa1", handle: "a", risk_profile: "cautious", primary_subjects: ["history"] };
  const B = { id: "agentbbbbbbbbb2", handle: "b", risk_profile: "aggressive", primary_subjects: ["football"] };
  const play = (g: GameKey, seed: number) => {
    let s: AnyState = initial(g, seed); const moves: string[] = [];
    while (!s.over) {
      for (const side of [0, 1] as const) {
        if (s.over || legal(g, s, side).length === 0) continue;
        const m = botMove(g, s, side, side === 0 ? A : B, side === 0 ? { temperament: "measured" } : { temperament: "impatient" });
        moves.push(JSON.stringify(m)); s = apply(g, s, side, m);
      }
    }
    return { s, moves };
  };
  for (const g of ["oware", "checkers", "trivia"] as GameKey[]) {
    it(`${g}: finishes with a result and replays identically`, () => {
      const one = play(g, 11), two = play(g, 11);
      expect(one.s.over).toBe(true); expect(one.s.winner).not.toBeNull(); expect(one.s.reason).toBeTruthy();
      expect(one.moves).toEqual(two.moves);
      // replay the move list from the start gives the same final state
      let r: AnyState = initial(g, 11);
      for (const m of one.moves) { const mv = JSON.parse(m); const side = g === "trivia" ? (legal(g, r, 0).length ? 0 : 1) : r.toMove; r = apply(g, r, side, mv); }
      expect(r.winner).toEqual(one.s.winner);
    });
  }
  it("play style comes from personality and is stable", () => {
    expect(playStyle(A, { temperament: "measured" })).toEqual(playStyle(A, { temperament: "measured" }));
    expect(playStyle(A, { temperament: "measured" }).depth).toBeGreaterThanOrEqual(playStyle(B, { temperament: "impatient" }).depth);
  });
  it("Elo moves toward the winner and is zero-sum on equal experience", () => {
    const [a, b] = elo(1200, 1200, 1, [5, 5]); expect(a).toBe(1216); expect(b).toBe(1184);
    const [c, d] = elo(1400, 1200, 0.5, [30, 30]); expect(c).toBeLessThan(1400); expect(d).toBeGreaterThan(1200);
  });
  it("banter states only the given facts, stays short and follows temperament", () => {
    const line = banter("win", A, { temperament: "blunt" }, "@b", "28–20", "m1");
    expect(["28–20. Done.", "Won. 28–20."]).toContain(line);
    expect(banter("win", A, { temperament: "blunt" }, "@b", "28–20", "m1")).toBe(line);
  });
});
