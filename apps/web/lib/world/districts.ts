// Palasora world: the open map around the first town. The town's plot grid sits in a core block (the town, the beach and
// marina to the west, the Exchange quarter east, the campus and arena south, farms north). Around it the land runs on
// without an edge: a ring of named districts on a regular street grid (residential, commercial, industrial, farmland),
// then countryside with villages, farms and woods. The coast runs north to south along the west. No Three.js here, so the
// 2D map, the server and the tests can use it.
import { TOWN_D, TOWN_W, plotCenter, type WorldPlot } from "./layout";

export type Zone = "residential" | "commercial" | "industrial" | "farmland" | "civic" | "park" | "countryside" | "sea";
export const ZONE_LABEL: Record<Zone, string> = {
  residential: "Residential", commercial: "Commercial", industrial: "Industrial", farmland: "Farmland", civic: "Civic", park: "Park",
  countryside: "Countryside", sea: "Sea",
};
export const ZONE_COLOR: Record<Zone, string> = {
  residential: "#6fb36a", commercial: "#4f7cac", industrial: "#c98a3a", farmland: "#d8c070", civic: "#9a6db5", park: "#3f9f6f",
  countryside: "#a8c597", sea: "#4fa3a5",
};

// The core block, in world units (1 unit = 10 m). x runs east, z runs south.
export const WEST = 15, EAST = 13, NORTH = 11;
export const CELL = 13; // one street block of the outer grid, street included
export const X0 = -TOWN_W / 2 - WEST, X1 = TOWN_W / 2 + EAST, Z0 = -TOWN_D / 2 - NORTH;
// the south edge lands on the outer grid (at least 12 units south of the town) so the town's avenues meet a street
export const Z1 = Z0 + Math.ceil((NORTH + TOWN_D + 12) / CELL) * CELL;
export const SOUTH = Z1 - TOWN_D / 2;
export const COAST = -TOWN_W / 2 - 3.2; // land starts here; sea to the west
export const SEA_Y = -0.42;
/** How far the map runs in each direction from the town (the camera stays inside). */
export const WORLD_R = 480;

/** The outer street grid: lines at GX + k * CELL and GZ + k * CELL. They meet the core block's east and north edges. */
export const GX = X1, GZ = Z0;
export const gridLine = (v: number, origin: number) => origin + Math.floor((v - origin) / CELL) * CELL;

/** The coastline: straight beside the town, gently curving further north and south. */
export function coastAt(z: number): number {
  if (z >= Z0 && z <= Z1) return COAST;
  const d = z > Z1 ? z - Z1 : Z0 - z;
  return COAST + 3.2 * Math.sin(d / 23) + 1.6 * Math.sin(d / 57 + 1.1) * Math.min(1, d / 40) - (z < Z0 ? 1.2 * Math.min(1, d / 30) : 0);
}
export const inCore = (x: number, z: number, m = 0) => x >= X0 - m && x <= X1 + m && z >= Z0 - m && z <= Z1 + m;

export type District = {
  id: string; name: string; zone: Zone; x0: number; x1: number; z0: number; z1: number; opensAt: number; text: string;
};
const gx = (k: number) => GX + k * CELL, gz = (k: number) => GZ + k * CELL;
const ROWS_CORE = Math.round((Z1 - Z0) / CELL);
/** The first ring of districts. The town itself is Old Town; the rest open as the population grows. */
export const DISTRICTS: District[] = [
  { id: "old-town", name: "Old Town", zone: "civic", x0: X0, x1: X1, z0: Z0, z1: Z1, opensAt: 0,
    text: "The first town: homes, the market, the harbour and the Town Hall. Every plot here is on the town's ledger." },
  { id: "market-mile", name: "Market Mile", zone: "commercial", x0: gx(0), x1: gx(2), z0: gz(2), z1: gz(ROWS_CORE), opensAt: 300,
    text: "Shops, offices and apartments along the avenues east of the Exchange." },
  { id: "dockside", name: "Dockside", zone: "industrial", x0: gx(2), x1: gx(4), z0: gz(2), z1: gz(ROWS_CORE), opensAt: 1500,
    text: "Warehouses, depots and the freight yard. Goods for the town's shops are stored and moved from here." },
  { id: "mill-district", name: "Mill District", zone: "industrial", x0: gx(0), x1: gx(4), z0: gz(-2), z1: gz(2), opensAt: 800,
    text: "Workshops, mills and factories. Raw goods from the farms are made into tools, meals and materials here." },
  { id: "northfield", name: "Northfield", zone: "farmland", x0: COAST, x1: gx(0), z0: gz(-4), z1: gz(0), opensAt: 1200,
    text: "Farms, barns, greenhouses and wind turbines on the land north of the town." },
  { id: "southgate", name: "Southgate", zone: "residential", x0: COAST, x1: gx(0), z0: Z1, z1: Z1 + 3 * CELL, opensAt: 0,
    text: "The town's first suburb: family homes round small parks, south of the campus." },
  { id: "palm-hill", name: "Palm Hill", zone: "residential", x0: gx(0), x1: gx(4), z0: Z1, z1: Z1 + 3 * CELL, opensAt: 0,
    text: "Homes on the hill south-east of the Exchange, laid out once Southgate is full." },
];

export function districtAt(x: number, z: number): District | null {
  if (x < coastAt(z)) return null;
  return DISTRICTS.find((d) => x >= d.x0 && x < d.x1 && z >= d.z0 && z < d.z1) ?? null;
}

/** Deterministic noise in 0..1 for a grid cell. */
export function cellNoise(i: number, j: number, salt = 0): number {
  let h = Math.imul(i * 374761393 + j * 668265263 + salt * 2246822519, 3266489917);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** The zone of a point: sea, a district's zone, or countryside dotted with villages and farms. */
export function zoneAt(x: number, z: number): Zone {
  if (x < coastAt(z)) return "sea";
  const d = districtAt(x, z);
  if (d) return d.zone === "civic" ? "civic" : d.zone;
  const i = Math.floor((x - GX) / CELL), j = Math.floor((z - GZ) / CELL);
  const n = cellNoise(Math.floor(i / 3), Math.floor(j / 3));
  if (n < 0.14) return "residential"; // a village
  if (n < 0.2) return "industrial"; // a farm co-op or depot
  return cellNoise(i, j, 7) < 0.55 ? "farmland" : "countryside";
}

/** The zone of a plot in the town, from what the plot is for. */
export function plotZone(p: Pick<WorldPlot, "area" | "use">): Zone {
  if (p.use === "civic") return "civic";
  if (p.use === "home") return "residential";
  if (p.area === "farmland") return "farmland";
  if (p.area === "harbourside") return "industrial";
  return "commercial";
}

/** "Open", or when a district opens, for its card. */
export function districtStatus(d: District, population: number): { open: boolean; text: string } {
  if (SUBURBS.includes(d.id)) return { open: true, text: "New homes are laid out here a street at a time, and a house goes up for each person who moves in" };
  if (population >= d.opensAt) return { open: true, text: d.opensAt === 0 ? "Open" : "Open: plots are being laid out" };
  return { open: false, text: `Opens when the town reaches ${d.opensAt.toLocaleString("en")} residents (${population.toLocaleString("en")} now)` };
}

// ---------------------------------------------------------------------------------------------------------------------
// Meadowvale growth: the suburbs fill one home at a time. Southgate, then Palm Hill, are laid out as lots on the outer
// street grid (eight round a small park in each block). The town opens a street of lots when its free homes run low, and
// each lot shows a house only once someone has moved in. A lot is a plot like any other ("S001" is lot 0), so it has a
// card, can be claimed and appears in Find a place; its place on the map comes from this list, not from grid x and y.
export const OUT_ROAD = 1.7;
export const SUBURBS = ["southgate", "palm-hill"];
export const LOTS_PER_BLOCK = 8;
const DOWNTOWN: [number, number] = [0, (Z0 + Z1) / 2];

/** The buildable inside of an outer block (west and north streets taken off, and the beach on the coast), or null. */
export function blockInterior(x0: number, z0: number): { ix0: number; ix1: number; iz0: number; iz1: number } | null {
  const x1 = x0 + CELL, z1 = z0 + CELL, cz = z0 + CELL / 2;
  const landX = Math.max(x0, coastAt(cz) + 1.6);
  const ix0 = Math.max(x0 + OUT_ROAD / 2 + 0.25, landX + 0.6), ix1 = x1 - OUT_ROAD / 2 - 0.25, iz0 = z0 + OUT_ROAD / 2 + 0.25, iz1 = z1 - OUT_ROAD / 2 - 0.25;
  return ix1 - ix0 < 2.5 ? null : { ix0, ix1, iz0, iz1 };
}

export type Lot = { n: number; x: number; z: number; w: number; d: number; ci: number; cj: number; district: string };
let lots: Lot[] | null = null;
/** Every suburb lot in the order they open: the nearest block to downtown first, and in each block the nearest lot. */
export function suburbLots(): Lot[] {
  if (lots) return lots;
  const blocks: { ci: number; cj: number; x0: number; z0: number; district: string; dist: number }[] = [];
  for (const id of SUBURBS) {
    const d = DISTRICTS.find((x) => x.id === id)!;
    for (let ci = Math.floor((d.x0 - GX) / CELL); GX + ci * CELL < d.x1; ci++) for (let cj = Math.floor((d.z0 - GZ) / CELL); GZ + cj * CELL < d.z1; cj++) {
      const x0 = GX + ci * CELL, z0 = GZ + cj * CELL, cx = x0 + CELL / 2, cz = z0 + CELL / 2;
      if (districtAt(cx, cz)?.id !== id || zoneAt(cx, cz) !== "residential" || !blockInterior(x0, z0)) continue;
      blocks.push({ ci, cj, x0, z0, district: id, dist: Math.hypot(cx - DOWNTOWN[0], cz - DOWNTOWN[1]) });
    }
  }
  const order = (k: string) => SUBURBS.indexOf(k);
  blocks.sort((a, b) => order(a.district) - order(b.district) || a.dist - b.dist || a.ci - b.ci || a.cj - b.cj);
  const out: Lot[] = [];
  for (const b of blocks) {
    const r = blockInterior(b.x0, b.z0)!;
    const w = (r.ix1 - r.ix0) / 3, d = (r.iz1 - r.iz0) / 3;
    const slots: Lot[] = [];
    for (let a = 0; a < 3; a++) for (let c = 0; c < 3; c++) {
      if (a === 1 && c === 1) continue; // the block's park
      slots.push({ n: 0, x: r.ix0 + w * (a + 0.5), z: r.iz0 + d * (c + 0.5), w, d, ci: b.ci, cj: b.cj, district: b.district });
    }
    slots.sort((p, q) => Math.hypot(p.x - DOWNTOWN[0], p.z - DOWNTOWN[1]) - Math.hypot(q.x - DOWNTOWN[0], q.z - DOWNTOWN[1]) || p.x - q.x);
    for (const s of slots) out.push({ ...s, n: out.length });
  }
  lots = out;
  return out;
}

/** The lot number of a suburb plot id ("S001" is lot 0), or -1. */
export const lotIndex = (id: string) => /^S\d{3,}$/.test(id) ? Number(id.slice(1)) - 1 : -1;
export const lotId = (n: number) => `S${String(n + 1).padStart(3, "0")}`;
/** The street a lot is on, named after its block: every block of eight is one short street. */
const STREET_NAMES = ["Palm Lane", "Baobab Close", "Iroko Road", "Mango Walk", "Hibiscus Row", "Acacia Way", "Shea Crescent", "Kola Street",
  "Cassia Lane", "Tamarind Close", "Ebony Road", "Plantain Walk", "Jacaranda Row", "Ube Way", "Cowrie Crescent", "Sunbird Street"];
export const lotStreet = (n: number) => STREET_NAMES[Math.floor(n / LOTS_PER_BLOCK) % STREET_NAMES.length] + (n >= LOTS_PER_BLOCK * STREET_NAMES.length ? " II" : "");
export const lotAddress = (n: number) => `${(n % LOTS_PER_BLOCK) + 1} ${lotStreet(n)}`;

/** Where any plot stands on the map: a town plot by its grid place, a suburb lot from the lot list. */
export function plotXZ(p: Pick<WorldPlot, "id" | "x" | "y" | "area">): [number, number] {
  if (p.area === "suburb") {
    const l = suburbLots()[lotIndex(p.id)];
    if (l) return [l.x, l.z];
  }
  return plotCenter(p.x, p.y);
}
/** "3 Palm Lane, Southgate" for a suburb plot id, or "". */
export function lotPlace(id: string): string {
  const l = suburbLots()[lotIndex(id)];
  return l ? `${lotAddress(l.n)}, ${DISTRICTS.find((d) => d.id === l.district)?.name ?? ""}` : "";
}
