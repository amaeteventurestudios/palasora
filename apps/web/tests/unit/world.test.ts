// Palasora Phase 6: the world viewer's street grid. Pure functions shared by the 3D town, the 2D map and the list view.
import { describe, expect, it } from "vitest";
import { SPEED, busy, outdoors } from "../../lib/world/life";
import { CELL, COAST, DISTRICTS, GX, GZ, X1, Z0, Z1, coastAt, districtAt, districtStatus, plotZone, zoneAt } from "../../lib/world/districts";
import { COLS, PLOT, ROAD, ROWS, TOWN_D, TOWN_W, X_STREETS, Y_STREETS, plotAt, plotCenter, plotTitle, streets, townTime, type WorldPlot } from "../../lib/world/layout";

describe("Phase 6 town grid", () => {
  it("every plot centre maps back to its own plot, and plots never overlap streets", () => {
    const { v, h } = streets();
    for (let x = 0; x < COLS; x++) for (let y = 0; y < ROWS; y++) {
      const [cx, cz] = plotCenter(x, y);
      expect(plotAt(cx, cz)).toEqual({ x, y });
      for (const sx of v) expect(Math.abs(cx - sx)).toBeGreaterThanOrEqual(PLOT / 2 + ROAD / 2 - 1e-9);
      for (const sz of h) expect(Math.abs(cz - sz)).toBeGreaterThanOrEqual(PLOT / 2 + ROAD / 2 - 1e-9);
    }
  });
  it("streets run between every two plots plus a ring road, inside the town", () => {
    const { v, h } = streets();
    expect(v).toHaveLength(X_STREETS.length + 2);
    expect(h).toHaveLength(Y_STREETS.length + 2);
    for (const x of v) expect(Math.abs(x)).toBeLessThan(TOWN_W / 2);
    for (const z of h) expect(Math.abs(z)).toBeLessThan(TOWN_D / 2);
    expect(plotAt(v[1], 0)).toBeNull();
  });
  it("row 0 is the south edge, nearest the camera", () => {
    expect(plotCenter(0, 0)[1]).toBeGreaterThan(plotCenter(0, 9)[1]);
    expect(plotCenter(11, 0)[0]).toBeGreaterThan(plotCenter(0, 0)[0]);
  });
  it("names plots from their records, never guessing", () => {
    const p = (o: Partial<WorldPlot>): WorldPlot => ({ id: "P000", area: "main", x: 0, y: 0, size: 1, prime: 0, use: "business", owner: "", building: "", level: 0, ...o });
    expect(plotTitle(p({ use: "civic", area: "town_hall" }))).toBe("Town Hall");
    expect(plotTitle(p({}))).toBe("Plot for sale");
    expect(plotTitle(p({ use: "home" }))).toBe("Home plot");
    expect(plotTitle(p({}), { id: "b1", type: "stall", plot: "P000", owner: "a", owner_name: "", level: 1, health: "green", status: "open", price_sora: 1, wage_sora: 1 })).toBe("Food stall");
    expect(plotTitle(p({}), { id: "b1", type: "stall", plot: "P000", owner: "a", owner_name: "", level: 1, health: "green", status: "closed", price_sora: 1, wage_sora: 1 })).toBe("Plot for sale");
    expect(townTime(0)).toBe("Day 1, 00:00");
    expect(townTime(49)).toBe("Day 3, 01:00");
  });
});

describe("Town life follows the clock at believable speeds", () => {
  const kmh = (u: number) => u * 10 * 3.6; // one world unit is ten metres
  it("cars, buses, people and the monorail move at real-world speeds", () => {
    expect(kmh(SPEED.car[1])).toBeLessThanOrEqual(35);
    expect(kmh(SPEED.bus)).toBeLessThanOrEqual(30);
    expect(kmh(SPEED.walk[0])).toBeGreaterThanOrEqual(3.5);
    expect(kmh(SPEED.walk[1])).toBeLessThanOrEqual(6.5);
    expect(kmh(SPEED.train)).toBeLessThanOrEqual(45);
  });
  it("streets are busiest at 8 and 18, lighter at midday, nearly empty at night", () => {
    expect(busy(8)).toBeGreaterThan(0.85);
    expect(busy(18)).toBeGreaterThan(0.85);
    expect(busy(12.5)).toBeLessThan(busy(8));
    expect(busy(12.5)).toBeGreaterThan(busy(3));
    expect(busy(3)).toBeLessThan(0.15);
    expect(outdoors(3)).toBeLessThan(0.05);
    expect(outdoors(8)).toBeGreaterThan(outdoors(14));
  });
});

describe("The open map: districts around the town", () => {
  it("the core block's east, north and south edges sit on the outer street grid", () => {
    const on = (v: number, o: number) => Math.abs(((v - o) % CELL + CELL) % CELL) < 1e-6 || Math.abs((((v - o) % CELL) + CELL) % CELL - CELL) < 1e-6;
    expect(on(X1, GX)).toBe(true);
    expect(on(Z0, GZ)).toBe(true);
    expect(on(Z1, GZ)).toBe(true);
  });
  it("the coast is straight beside the town and has no jumps further out", () => {
    expect(coastAt(Z0)).toBeCloseTo(COAST); expect(coastAt(Z1)).toBeCloseTo(COAST);
    for (let z = -400; z < 400; z += 0.5) expect(Math.abs(coastAt(z + 0.5) - coastAt(z))).toBeLessThan(0.2);
    expect(zoneAt(COAST - 5, 0)).toBe("sea");
  });
  it("districts never overlap, and each has a zone, a name and an opening size", () => {
    for (const a of DISTRICTS) for (const b of DISTRICTS) {
      if (a === b) continue;
      const overlap = a.x0 < b.x1 - 1e-6 && b.x0 < a.x1 - 1e-6 && a.z0 < b.z1 - 1e-6 && b.z0 < a.z1 - 1e-6;
      expect(overlap, `${a.id} and ${b.id}`).toBe(false);
    }
    const zones = new Set(DISTRICTS.map((d) => d.zone));
    for (const z of ["residential", "commercial", "industrial", "farmland"]) expect(zones.has(z as never)).toBe(true);
    expect(districtAt(0, 0)?.id).toBe("old-town");
    expect(districtAt(60, -25)?.zone).toBe("industrial");
  });
  it("a district opens when the town is big enough", () => {
    const mill = DISTRICTS.find((d) => d.id === "mill-district")!;
    expect(districtStatus(mill, 10).open).toBe(false);
    expect(districtStatus(mill, 10).text).toBe("Opens when the town reaches 800 residents (10 now)");
    expect(districtStatus(mill, 800).open).toBe(true);
  });
  it("plots are zoned by what they are for", () => {
    expect(plotZone({ use: "home", area: "main" })).toBe("residential");
    expect(plotZone({ use: "business", area: "market" })).toBe("commercial");
    expect(plotZone({ use: "business", area: "farmland" })).toBe("farmland");
    expect(plotZone({ use: "business", area: "harbourside" })).toBe("industrial");
    expect(plotZone({ use: "civic", area: "town_hall" })).toBe("civic");
  });
  it("past the districts the land carries on: villages, farms and woods, never empty", () => {
    const seen = new Set<string>();
    for (let x = 100; x < 400; x += 13) for (let z = -400; z < 400; z += 13) seen.add(zoneAt(x, z));
    expect(seen.has("farmland") && seen.has("countryside") && seen.has("residential")).toBe(true);
  });
});
