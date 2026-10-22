// Palasora Phase 6: the world viewer's street grid. Pure functions shared by the 3D town, the 2D map and the list view.
import { describe, expect, it } from "vitest";
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
