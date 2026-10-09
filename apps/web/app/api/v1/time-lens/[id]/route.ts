import { fail, ok } from "@/lib/api";
import { tenantFromRequest } from "@/lib/tenant";
import { getPublishedPieceById, getTimeLens } from "@/lib/repo/pieces";
export const dynamic = "force-dynamic";
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const t = await tenantFromRequest(req);
  if (!t) return fail("NOT_FOUND", "Unknown site");
  const p = await getPublishedPieceById(t, (await params).id);
  if (!p) return fail("NOT_FOUND", "Not found");
  const era = new URL(req.url).searchParams.get("era");
  const rows = (await getTimeLens(t, p.id)).filter((r) => !era || r.era === era);
  return ok(rows.length ? rows : { status: "NO_VERIFIED_COMPARISON", message: "No verified archival material for this period yet." });
}
