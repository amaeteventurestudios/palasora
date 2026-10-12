// ISSUE-21: pure dependency-impact walk (client-safe, unit-tested).
export type Edge = { from: string; to: string; why: string };
/** Everything that stops working if `id` fails (walks dependents). Pure; used by the "what if" view. */
export function impactOf(id: string, edges: Edge[]): string[] {
  const out = new Set<string>(); const stack = [id];
  while (stack.length) { const n = stack.pop()!; for (const e of edges) if (e.to === n && !out.has(e.from)) { out.add(e.from); stack.push(e.from); } }
  return [...out];
}
