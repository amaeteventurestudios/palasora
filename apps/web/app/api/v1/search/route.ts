import { fail, ok } from "@/lib/api";
import { tenantFromRequest } from "@/lib/tenant";
import { editorialFetch } from "@/lib/editorial-client";
import { fallbackSearch, publicFilter, toSummary } from "@/lib/repo/pieces";
import { pb, q } from "@/lib/pb";
import { clientKey, rateLimit } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  const t = await tenantFromRequest(req);
  if (!t) return fail("NOT_FOUND", "Unknown site");
  if (!rateLimit(`search:${clientKey(req.headers)}`, 60, 60_000).ok) return fail("RATE_LIMITED", "Too many requests for now. Please try again shortly.");
  const u = new URL(req.url);
  const term = (u.searchParams.get("q") ?? "").slice(0, 120);
  const country = u.searchParams.get("country") ?? undefined, topic = u.searchParams.get("topic") ?? undefined;
  if (!term.trim()) return ok([]);
  const p = new URLSearchParams({ tenant_id: t.id, q: term, ...(country && { country }), ...(topic && { topic }) });
  const r = await editorialFetch<{ ids: string[] }>(`/search?${p}`);
  if (!r) return ok(await fallbackSearch(t, term, country, topic), { engine: "fallback" });
  if (!r.ids.length) return ok([], { engine: "fts" });
  const rows = await pb.list("editorial_pieces", { filter: `${publicFilter(t)} && (${r.ids.slice(0, 20).map((i) => `id=${q(i)}`).join(" || ")})`, perPage: 20 });
  return ok(rows.map(toSummary), { engine: "fts" });
}
