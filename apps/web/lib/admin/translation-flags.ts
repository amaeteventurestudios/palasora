// ISSUE-10: pure translation-review hints (unit-tested). Hints for a reviewer, never a verdict.
export type FieldPair = { key: string; original: string; translated: string };
const sentences = (s: string) => (s.match(/[.!?؟。]\s+\S/g) ?? []).length;

/** Heuristic flags: the reported "two headlines merged into one" failure, lost names/numbers, empty output. */
export function flagsFor(pairs: FieldPair[], qaFails: string[]): string[] {
  const f = new Set<string>();
  const h = pairs.find((x) => x.key === "headline");
  if (h && h.translated && (h.translated.length > 1.9 * Math.max(1, h.original.length) || sentences(h.translated) > sentences(h.original) + 1)) f.add("possible combined headline");
  if (qaFails.some((x) => x.endsWith(":names"))) f.add("names changed or missing");
  if (qaFails.some((x) => x.endsWith(":numbers"))) f.add("numbers changed or missing");
  if (pairs.some((x) => x.original && !x.translated.trim())) f.add("empty field");
  return [...f];
}

