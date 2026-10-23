// Palasora Phase 6: the town's street grid in world units, shared by the 3D viewer, the 2D map and the list view.
// No Three.js here, so the 2D map and the server can use it. The plot grid itself (12 x 10, ids P{y}{x:02d}) comes from
// the economy service (economy/town/layout.py); this file only decides where streets run between the plots.

export type WorldPlot = { id: string; area: string; x: number; y: number; size: number; prime: number; use: "home" | "business" | "civic"; owner: string;
  building: string; level: number; business?: string; price?: number;
  auction?: { id: number; reserve: number; high: number; bids: number; ends_tick: number; min_bid: number } };
/** Goods on the move (step 4): a contract's daily route or the last day's deliveries, from plot to plot. */
export type GoodsFlow = { from: string; to: string; good: "crops" | "meals" | "tools" | "materials"; qty: number; kind: "contract" | "delivery"; moving: boolean };
export type WorldBusiness = { id: string; type: "farm" | "workshop" | "stall" | "delivery" | "factory"; plot: string; owner: string; owner_name: string; level: number;
  health: "green" | "yellow" | "orange" | "red"; status: "open" | "closed"; price_sora: number; wage_sora: number; opened_tick?: number; cart?: boolean; listed?: boolean };
export type AwayItem = { event: string; kind: string; text: string; tick: number; yours: boolean; plot: string | null };
export type WorldData = {
  town: { id: string; name: string; slug: string }; tick: number; population?: number; grid: { w: number; d: number }; founded: boolean; plots: WorldPlot[];
  businesses: WorldBusiness[]; mine: { plot: string | null; agents: string[]; businesses: string[]; resident: boolean; home?: string | null };
  away: { since_tick: number; items: AwayItem[]; quiet: boolean; total: number } | null; markers: { plot: string; event: string; kind: string; yours: boolean }[];
  flows?: GoodsFlow[]; market?: { stalls: number }; suburb?: { recent: string[] };
};

export const PLOT = 2.4; // one plot, in world units (metres / 10)
export const ROAD = 1.7; // a two-lane street with pavements
export const COLS = 12, ROWS = 10;
/** Streets run before these columns and rows (plus the ring road around the town): blocks are two plots across. */
export const X_STREETS = [1, 3, 5, 7, 9, 11];
export const Y_STREETS = [2, 4, 6, 8];

const before = (list: number[], i: number) => list.filter((c) => c <= i).length;
/** Left edge of column x and near edge of row y, in world units, before centring. */
const left = (x: number) => ROAD + x * PLOT + before(X_STREETS, x) * ROAD;
const near = (y: number) => ROAD + y * PLOT + before(Y_STREETS, y) * ROAD;
export const TOWN_W = left(COLS - 1) + PLOT + ROAD;
export const TOWN_D = near(ROWS - 1) + PLOT + ROAD;

/** World centre of a plot: x runs east, row 0 is the south edge (nearest the camera), so z = -north. */
export function plotCenter(x: number, y: number): [number, number] {
  return [left(x) + PLOT / 2 - TOWN_W / 2, -(near(y) + PLOT / 2 - TOWN_D / 2)];
}
/** Centre lines of every street: `v` streets run north-south at a fixed x, `h` streets east-west at a fixed z. */
export function streets(): { v: number[]; h: number[] } {
  const v = [ROAD / 2, ...X_STREETS.map((c) => left(c) - ROAD / 2), TOWN_W - ROAD / 2].map((x) => x - TOWN_W / 2);
  const h = [ROAD / 2, ...Y_STREETS.map((r) => near(r) - ROAD / 2), TOWN_D - ROAD / 2].map((z) => -(z - TOWN_D / 2));
  return { v, h };
}
/** The plot under a world point, if any. */
export function plotAt(wx: number, wz: number): { x: number; y: number } | null {
  for (let x = 0; x < COLS; x++) for (let y = 0; y < ROWS; y++) {
    const [cx, cz] = plotCenter(x, y);
    if (Math.abs(wx - cx) <= PLOT / 2 && Math.abs(wz - cz) <= PLOT / 2) return { x, y };
  }
  return null;
}

export const AREA_LABEL: Record<string, string> = {
  market: "Downtown", main: "Home quarters", harbourside: "Workshop yard", farmland: "Farm belt", town_hall: "Downtown", market_hall: "Downtown", harbour: "Harbour",
  suburb: "Southgate",
};
export const CIVIC_LABEL: Record<string, string> = { town_hall: "Town Hall", market_hall: "Market Hall", harbour: "Harbour" };
export const BUSINESS_LABEL: Record<string, string> = { farm: "Farm", workshop: "Workshop", stall: "Food stall", delivery: "Delivery depot", factory: "Food factory" };
export const HEALTH_LABEL: Record<string, string> = { green: "Has everything", yellow: "Running low", orange: "Getting a little", red: "Getting nothing" };

/** What a plot is, in words (cards, the 2D map and the list view all use this). */
export function plotTitle(p: WorldPlot, biz?: WorldBusiness): string {
  if (p.use === "civic") return CIVIC_LABEL[p.area] ?? "Town building";
  if (biz && biz.status === "open") return BUSINESS_LABEL[biz.type] ?? "Business";
  if (p.use === "home") return p.owner ? "House" : p.area === "suburb" ? "New home" : "Free home";
  if (p.auction) return "Plot at auction";
  return p.owner ? "Empty plot" : "Plot for sale";
}

/** Town clock: hour 0 is the town's first morning. */
export const townTime = (tick: number) => `Day ${Math.floor(tick / 24) + 1}, ${String(tick % 24).padStart(2, "0")}:00`;
