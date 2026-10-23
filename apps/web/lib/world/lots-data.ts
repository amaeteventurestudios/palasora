// The suburb lots as the economy service reads them (town/suburb_lots.json): number, district, address and a place in
// the town's grid units, so distances from a suburb home to work are about right. Written by scripts/suburb-lots.mts;
// a unit test checks the file still matches suburbLots().
import { COLS, ROWS, TOWN_D, TOWN_W } from "./layout";
import { lotAddress, lotId, suburbLots } from "./districts";

export function lotsData() {
  const px = TOWN_W / COLS, pz = TOWN_D / ROWS;
  return suburbLots().map((l) => ({
    id: lotId(l.n), n: l.n, district: l.district, address: lotAddress(l.n),
    x: Math.round(((l.x + TOWN_W / 2) / px - 0.5) * 100) / 100, y: Math.round(((TOWN_D / 2 - l.z) / pz - 0.5) * 100) / 100,
  }));
}
