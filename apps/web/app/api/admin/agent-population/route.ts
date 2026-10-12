// GET /api/admin/agent-population: live counts per country, saved groups and recent jobs (staff read).
import { ok, fail } from "@/lib/api";
import { adminApi, isResponse } from "@/lib/admin/api-guard";
import { groups, jobs, popStats } from "@/lib/admin/population";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const c = await adminApi(req, "agents", "view");
  if (isResponse(c)) return c;
  const [stats, g, j] = await Promise.all([popStats(c.tenant), groups(c.tenant), jobs(c.tenant)]);
  if (!stats) return fail("UNAVAILABLE", "Editorial service unavailable");
  return ok({ stats, groups: g, jobs: j });
}
