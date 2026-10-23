// Palasora world: the open map around the first town. The town's plot grid sits in a core block (the town, the beach and
// marina to the west, the Exchange quarter east, the campus and arena south, farms north). Around it the land runs on
// without an edge: a ring of named districts on a regular street grid (residential, commercial, industrial, farmland),
// then countryside with villages, farms and woods. The coast runs north to south along the west. No Three.js here, so the
// 2D map, the server and the tests can use it.
import { TOWN_D, TOWN_W, type WorldPlot } from "./layout";

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
  { id: "southgate", name: "Southgate", zone: "residential", x0: COAST, x1: gx(0), z0: Z1, z1: Z1 + 3 * CELL, opensAt: 500,
    text: "Streets of family homes, a school and parks south of the campus." },
  { id: "palm-hill", name: "Palm Hill", zone: "residential", x0: gx(0), x1: gx(4), z0: Z1, z1: Z1 + 3 * CELL, opensAt: 2000,
    text: "Apartments and terraced homes on the hill south-east of the Exchange." },
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
  if (population >= d.opensAt) return { open: true, text: d.opensAt === 0 ? "Open" : "Open: plots are being laid out" };
  return { open: false, text: `Opens when the town reaches ${d.opensAt.toLocaleString("en")} residents (${population.toLocaleString("en")} now)` };
}
