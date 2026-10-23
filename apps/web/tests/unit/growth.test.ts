import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { CELL, DISTRICTS, GX, GZ, blockInterior, districtStatus, lotAddress, lotId, lotIndex, plotXZ, suburbLots } from "../../lib/world/districts";
import { lotsData } from "../../lib/world/lots-data";

describe("Meadowvale growth: suburb lots", () => {
  const lots = suburbLots();
  it("the economy service reads the same lots the map draws", () => {
    const file = JSON.parse(readFileSync(path.resolve(__dirname, "../../../../services/editorial/palavva_editorial/economy/town/suburb_lots.json"), "utf8"));
    expect(file).toEqual(lotsData());
  });
  it("Southgate fills first, nearest blocks first, eight lots round a park in each block", () => {
    expect(lots.length).toBeGreaterThanOrEqual(160);
    const firstPalm = lots.findIndex((l) => l.district === "palm-hill");
    expect(firstPalm).toBeGreaterThan(0);
    expect(lots.slice(firstPalm).every((l) => l.district === "palm-hill")).toBe(true);
    const blocks = new Map<string, number>();
    for (const l of lots) blocks.set(`${l.ci},${l.cj}`, (blocks.get(`${l.ci},${l.cj}`) ?? 0) + 1);
    expect([...blocks.values()].every((n) => n === 8)).toBe(true);
  });
  it("every lot sits inside its block, clear of the streets and of the other lots", () => {
    for (const l of lots) {
      expect(blockInterior(GX + l.ci * CELL, GZ + l.cj * CELL)).not.toBeNull();
      const d = DISTRICTS.find((x) => x.id === l.district)!;
      expect(l.x).toBeGreaterThan(d.x0); expect(l.x).toBeLessThan(d.x1);
      expect(l.z).toBeGreaterThan(d.z0); expect(l.z).toBeLessThan(d.z1);
    }
    for (let a = 0; a < lots.length; a++) for (let b = a + 1; b < lots.length; b++) {
      const p = lots[a], q = lots[b];
      expect(Math.abs(p.x - q.x) >= (p.w + q.w) / 2 - 1e-6 || Math.abs(p.z - q.z) >= (p.d + q.d) / 2 - 1e-6).toBe(true);
    }
  });
  it("lot ids, addresses and places", () => {
    expect(lotId(0)).toBe("S001"); expect(lotIndex("S010")).toBe(9); expect(lotIndex("P101")).toBe(-1);
    expect(lotAddress(0)).toBe("1 Palm Lane"); expect(lotAddress(8)).toBe("1 Baobab Close");
    expect(plotXZ({ id: "S001", x: 0, y: 0, area: "suburb" })).toEqual([lots[0].x, lots[0].z]);
    expect(districtStatus(DISTRICTS.find((d) => d.id === "southgate")!, 3).open).toBe(true);
  });
});
