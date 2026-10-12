// POST /api/admin/agent-population/jobs/:id/(pause|resume|cancel): the runner sees the new status before its next batch.
import { ok, fail } from "@/lib/api";
import { adminApi, isResponse } from "@/lib/admin/api-guard";
import { job } from "@/lib/admin/population";
import { pb } from "@/lib/pb";
import { audit } from "@/lib/audit";
export const dynamic = "force-dynamic";

const NEXT: Record<string, { from: string[]; to: string; phase: string }> = {
  pause: { from: ["queued", "running"], to: "paused", phase: "pause requested; stops after the current batch" },
  resume: { from: ["paused"], to: "queued", phase: "resume requested; continues from its saved position" },
  cancel: { from: ["queued", "running", "paused"], to: "canceled", phase: "canceled by an administrator; identities already created are kept" },
};

export async function POST(req: Request, { params }: { params: Promise<{ id: string; action: string }> }) {
  const c = await adminApi(req, "agents", "administer", { mutate: true });
  if (isResponse(c)) return c;
  const { id, action } = await params;
  const rule = NEXT[action];
  if (!rule) return fail("NOT_FOUND", "Unknown action");
  const j = /^[a-z0-9]{15}$/.test(id) ? await job(c.tenant, id) : null;
  if (!j) return fail("NOT_FOUND", "No such job");
  if (!rule.from.includes(j.status)) return fail("CONFLICT", `A ${j.status} job cannot be ${action}d`);
  const upd: Record<string, unknown> = { status: rule.to, phase: rule.phase };
  if (action === "cancel") upd.finished_at = new Date().toISOString().replace("T", " ");
  const r = await pb.update("population_jobs", j.id, upd);
  await audit(c.tenant.id, c.actor.id, `population.job_${action}`, "population_jobs", j.id, { from: j.status, done: j.done_count });
  return ok(r);
}
