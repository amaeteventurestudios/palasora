// Writes the suburb lots for the economy service: npx tsx scripts/suburb-lots.mts
import { writeFileSync } from "node:fs";
import path from "node:path";
import { lotsData } from "../lib/world/lots-data";

const out = path.resolve(import.meta.dirname, "../../../services/editorial/palavva_editorial/economy/town/suburb_lots.json");
writeFileSync(out, JSON.stringify(lotsData()) + "\n");
console.log(`wrote ${lotsData().length} lots to ${out}`);
