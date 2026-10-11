// GET /api/admin/agent-population/jobs/:id: live progress of one job (staff read).
import { ok, fail } from "@/lib/api";
import { adminApi, isResponse } from "@/lib/admin/api-guard";
import { job } from "@/lib/admin/population";
export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const c = await adminApi(req, "editor");
  if (isResponse(c)) return c;
  const { id } = await params;
  const j = /^[a-z0-9]{15}$/.test(id) ? await job(c.tenant, id) : null;
  return j ? ok(j) : fail("NOT_FOUND", "No such job");
}
