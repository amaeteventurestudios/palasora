// ISSUE-28 Checkers (English draughts, 8×8). Pure and deterministic like oware.ts.
// Board: 32 dark squares indexed 0-31 row by row from the top (row 0 = side B's back row). Side A ("dark", moves first) starts on
// rows 5-7 and moves up; side B ("light") starts on rows 0-2 and moves down. Pieces: 1/2 = A man/king, -1/-2 = B man/king, 0 empty.
// Rules: men move diagonally forward one square; kings both ways. Captures are compulsory; a capturing piece must keep jumping while
// it can (the move is the whole jump sequence); a man reaching the far row becomes a king and the move ends. You lose when you have
// no legal move (no pieces or all blocked). Draw: 80 plies in a row with no capture and no man moved, or MAX_PLIES total.
export type CheckersMove = number[]; // [from, to] or a jump path [from, land1, land2, ...]
export type CheckersState = { board: number[]; toMove: 0 | 1; ply: number; quiet: number; over: boolean; winner: 0 | 1 | "draw" | null; reason: string };
export const CHECKERS_MAX_PLIES = 400;

export function checkersInitial(): CheckersState {
  const board = Array(32).fill(0);
  for (let i = 0; i < 12; i++) board[i] = -1;
  for (let i = 20; i < 32; i++) board[i] = 1;
  return { board, toMove: 0, ply: 0, quiet: 0, over: false, winner: null, reason: "" };
}

const rc = (i: number): [number, number] => { const r = Math.floor(i / 4); return [r, (i % 4) * 2 + (r % 2 === 0 ? 1 : 0)]; };
const idx = (r: number, c: number): number | null => (r < 0 || r > 7 || c < 0 || c > 7 || (r + c) % 2 === 0 ? null : r * 4 + Math.floor(c / 2));
const mine = (side: 0 | 1, v: number) => (side === 0 ? v > 0 : v < 0);
const dirs = (v: number): [number, number][] => (Math.abs(v) === 2 ? [[-1, -1], [-1, 1], [1, -1], [1, 1]] : v > 0 ? [[-1, -1], [-1, 1]] : [[1, -1], [1, 1]]);
const crowns = (v: number, to: number) => (v === 1 && to < 4) || (v === -1 && to >= 28);

function jumpsFrom(board: number[], from: number, v: number): CheckersMove[] {
  const out: CheckersMove[] = [];
  const walk = (b: number[], at: number, piece: number, path: number[]) => {
    let extended = false;
    const [r, c] = rc(at);
    for (const [dr, dc] of dirs(piece)) {
      const over = idx(r + dr, c + dc), land = idx(r + 2 * dr, c + 2 * dc);
      if (over === null || land === null || b[land] !== 0 || b[over] === 0 || mine(piece > 0 ? 0 : 1, b[over])) continue;
      const nb = b.slice(); nb[land] = piece; nb[at] = 0; nb[over] = 0;
      extended = true;
      if (crowns(piece, land)) out.push([...path, land]); // crowning ends the move
      else walk(nb, land, piece, [...path, land]);
    }
    if (!extended && path.length > 1) out.push(path);
  };
  walk(board, from, v, [from]);
  return out;
}

export function checkersMoves(s: CheckersState): CheckersMove[] {
  if (s.over) return [];
  const jumps: CheckersMove[] = [], steps: CheckersMove[] = [];
  s.board.forEach((v, i) => {
    if (!mine(s.toMove, v)) return;
    jumps.push(...jumpsFrom(s.board, i, v));
    const [r, c] = rc(i);
    for (const [dr, dc] of dirs(v)) { const to = idx(r + dr, c + dc); if (to !== null && s.board[to] === 0) steps.push([i, to]); }
  });
  return jumps.length ? jumps : steps; // captures are compulsory
}

const same = (a: CheckersMove, b: CheckersMove) => a.length === b.length && a.every((x, i) => x === b[i]);

export function checkersApply(s: CheckersState, move: CheckersMove): CheckersState {
  if (!Array.isArray(move) || !checkersMoves(s).some((m) => same(m, move))) throw new Error("ILLEGAL_MOVE");
  const b = s.board.slice();
  const piece = b[move[0]];
  let captured = false;
  for (let k = 1; k < move.length; k++) {
    const [r1, c1] = rc(move[k - 1]), [r2, c2] = rc(move[k]);
    if (Math.abs(r2 - r1) === 2) { b[idx((r1 + r2) / 2, (c1 + c2) / 2)!] = 0; captured = true; }
  }
  const to = move[move.length - 1];
  b[move[0]] = 0; b[to] = crowns(piece, to) ? piece * 2 : piece;
  const quiet = captured || Math.abs(piece) === 1 ? 0 : s.quiet + 1;
  const n: CheckersState = { board: b, toMove: (1 - s.toMove) as 0 | 1, ply: s.ply + 1, quiet, over: false, winner: null, reason: "" };
  if (checkersMoves(n).length === 0) return { ...n, over: true, winner: s.toMove, reason: b.some((v) => mine(n.toMove, v)) ? "opponent has no legal move" : "all opponent pieces captured" };
  if (quiet >= 80) return { ...n, over: true, winner: "draw", reason: "40 moves each with no capture and no man moved" };
  if (n.ply >= CHECKERS_MAX_PLIES) return { ...n, over: true, winner: "draw", reason: `move limit (${CHECKERS_MAX_PLIES}) reached` };
  return n;
}

/** Material: man 3, king 5, small advancement bonus; alpha-beta to `depth` plies with deterministic move ordering. */
export function checkersBest(s: CheckersState, depth: number, salt = 0): CheckersMove {
  const me = s.toMove;
  const score = (x: CheckersState) => {
    if (x.over) return x.winner === me ? 10_000 : x.winner === "draw" ? 0 : -10_000;
    let v = 0;
    x.board.forEach((p, i) => { if (!p) return; const r = Math.floor(i / 4); const val = Math.abs(p) === 2 ? 5 : 3 + 0.1 * (p > 0 ? 7 - r : r); v += mine(me, p) ? val : -val; });
    return v;
  };
  const order = (ms: CheckersMove[]) => [...ms].sort((a, b) => ((a[0] * 7 + a[a.length - 1] + salt) % 13) - ((b[0] * 7 + b[b.length - 1] + salt) % 13));
  const search = (x: CheckersState, d: number, a: number, b: number): number => {
    if (d === 0 || x.over) return score(x);
    const ms = order(checkersMoves(x));
    if (x.toMove === me) { let v = -Infinity; for (const m of ms) { v = Math.max(v, search(checkersApply(x, m), d - 1, a, b)); a = Math.max(a, v); if (a >= b) break; } return v; }
    let v = Infinity; for (const m of ms) { v = Math.min(v, search(checkersApply(x, m), d - 1, a, b)); b = Math.min(b, v); if (a >= b) break; } return v;
  };
  let best: CheckersMove = [], bestV = -Infinity;
  for (const m of order(checkersMoves(s))) { const v = search(checkersApply(s, m), depth - 1, -Infinity, Infinity); if (v > bestV) { bestV = v; best = m; } }
  return best;
}

export const squareRC = rc;
