// ISSUE-28 Ayo / Oware with the "abapa" rules (the version used in tournaments and in OpenSpiel's `oware`). Pure, deterministic,
// no I/O: the same state and move always give the same result, so matches replay exactly from their move list.
//
// Board: 12 pits, indices 0-5 belong to side A (left to right from A's view), 6-11 to side B; sowing runs 0→11→0 (anticlockwise).
// Rules implemented:
//  1. Pick a non-empty pit on your side; sow one seed per pit anticlockwise, skipping the starting pit when 12+ seeds are sown.
//  2. Capture: if the last seed lands in an opponent pit that now holds 2 or 3, capture it, then keep capturing backwards through
//     consecutive opponent pits holding 2 or 3.
//  3. Grand slam (abapa): a move that would capture ALL the opponent's seeds is allowed but captures nothing.
//  4. Feeding: if the opponent has no seeds, you must make a move that gives them seeds. If no move can, the game ends and you
//     take every seed left on the board.
//  5. Win with more than 24 seeds; 24-24 is a draw. To stop endless cycles, after MAX_PLIES plies (or a position repeated three
//     times) the game ends and each player takes the seeds on their own side.
export type OwareState = { pits: number[]; store: [number, number]; toMove: 0 | 1; ply: number; seen: Record<string, number>; over: boolean; winner: 0 | 1 | "draw" | null; reason: string };
export const OWARE_MAX_PLIES = 300;

export function owareInitial(): OwareState {
  return { pits: Array(12).fill(4), store: [0, 0], toMove: 0, ply: 0, seen: {}, over: false, winner: null, reason: "" };
}
const own = (side: 0 | 1, i: number) => (side === 0 ? i < 6 : i >= 6);
const sideSeeds = (pits: number[], side: 0 | 1) => pits.slice(side * 6, side * 6 + 6).reduce((a, b) => a + b, 0);

/** Sow and capture without any legality check beyond the pit being non-empty; returns the new pits and seeds captured. */
function sow(pits: number[], pit: number, side: 0 | 1): { pits: number[]; captured: number } {
  const p = pits.slice();
  let seeds = p[pit]; p[pit] = 0;
  let i = pit;
  while (seeds > 0) { i = (i + 1) % 12; if (i === pit) continue; p[i]++; seeds--; }
  // capture backwards from the last pit while it is the opponent's and holds 2 or 3
  const caps: number[] = [];
  let j = i;
  while (!own(side, j) && (p[j] === 2 || p[j] === 3)) { caps.push(j); j = (j + 11) % 12; if (own(side, j)) break; }
  const total = caps.reduce((a, k) => a + p[k], 0);
  const oppAfter = sideSeeds(p, (1 - side) as 0 | 1);
  if (caps.length && total === oppAfter) return { pits: p, captured: 0 }; // grand slam: no capture
  for (const k of caps) p[k] = 0;
  return { pits: p, captured: total };
}

/** Legal moves as pit indices (0-11) for the side to move. */
export function owareMoves(s: OwareState): number[] {
  if (s.over) return [];
  const side = s.toMove, opp = (1 - side) as 0 | 1;
  const mine = [...Array(6)].map((_, k) => side * 6 + k).filter((i) => s.pits[i] > 0);
  if (sideSeeds(s.pits, opp) > 0) return mine;
  return mine.filter((i) => sideSeeds(sow(s.pits, i, side).pits, opp) > 0); // must feed
}

const key = (s: { pits: number[]; toMove: number }) => `${s.toMove}:${s.pits.join(",")}`;

function finish(s: OwareState, reason: string): OwareState {
  const winner = s.store[0] > s.store[1] ? 0 : s.store[1] > s.store[0] ? 1 : "draw";
  return { ...s, over: true, winner, reason };
}

export function owareApply(s: OwareState, pit: number): OwareState {
  if (!Number.isInteger(pit) || !owareMoves(s).includes(pit)) throw new Error("ILLEGAL_MOVE");
  const side = s.toMove;
  const r = sow(s.pits, pit, side);
  const store: [number, number] = [...s.store] as [number, number];
  store[side] += r.captured;
  let n: OwareState = { pits: r.pits, store, toMove: (1 - side) as 0 | 1, ply: s.ply + 1, seen: { ...s.seen }, over: false, winner: null, reason: "" };
  n.seen[key(n)] = (n.seen[key(n)] ?? 0) + 1;
  if (store[0] > 24 || store[1] > 24) return finish(n, "more than half the seeds captured");
  if (store[0] === 24 && store[1] === 24) return finish(n, "24 seeds each");
  if (owareMoves(n).length === 0) {
    // Rule 4: the side to move holds seeds but no move feeds the empty opponent, so it takes every seed left (all on its own side).
    // (A side to move with no seeds at all cannot arise under abapa, because a grand slam captures nothing; if it ever did, the
    // remaining seeds would go to the side they sit on.)
    const toMove = n.toMove, mineLeft = sideSeeds(n.pits, toMove);
    const takes = mineLeft > 0 ? toMove : ((1 - toMove) as 0 | 1);
    const rest = n.pits.reduce((a, b) => a + b, 0);
    n.store[takes] += rest; n.pits = Array(12).fill(0);
    return finish(n, mineLeft > 0 ? "opponent could not be fed; remaining seeds taken" : "no seeds left to move; remaining seeds taken");
  }
  if (n.ply >= OWARE_MAX_PLIES || n.seen[key(n)] >= 3) {
    n.store = [n.store[0] + sideSeeds(n.pits, 0), n.store[1] + sideSeeds(n.pits, 1)]; n.pits = Array(12).fill(0);
    return finish(n, n.ply >= OWARE_MAX_PLIES ? `move limit (${OWARE_MAX_PLIES}) reached; each side takes its own seeds` : "position repeated three times; each side takes its own seeds");
  }
  return n;
}

/** Alpha-beta search on seed difference. `depth` 1-7 sets strength; ties are broken by a deterministic per-agent order. */
export function owareBest(s: OwareState, depth: number, tieOrder: number[] = [0, 1, 2, 3, 4, 5]): number {
  const me = s.toMove;
  const order = (moves: number[]) => [...moves].sort((a, b) => tieOrder.indexOf(a % 6) - tieOrder.indexOf(b % 6));
  const evalFor = (x: OwareState) => (x.over ? (x.winner === me ? 1000 : x.winner === "draw" ? 0 : -1000) : 0) + x.store[me] - x.store[1 - me];
  const search = (x: OwareState, d: number, a: number, b: number): number => {
    if (d === 0 || x.over) return evalFor(x);
    const moves = order(owareMoves(x));
    if (x.toMove === me) { let v = -Infinity; for (const m of moves) { v = Math.max(v, search(owareApply(x, m), d - 1, a, b)); a = Math.max(a, v); if (a >= b) break; } return v; }
    let v = Infinity; for (const m of moves) { v = Math.min(v, search(owareApply(x, m), d - 1, a, b)); b = Math.min(b, v); if (a >= b) break; } return v;
  };
  let best = -1, bestV = -Infinity;
  for (const m of order(owareMoves(s))) { const v = search(owareApply(s, m), depth - 1, -Infinity, Infinity); if (v > bestV) { bestV = v; best = m; } }
  return best;
}
