// POST /api/admin/agent-population/jobs: confirmed, idempotent intent -> durable job (tenant admins). The editorial
// service re-plans from live counts and refuses (409) when the numbers differ from the preview the operator confirmed.
import { NextResponse } from "next/server";
import { ok, fail } from "@/lib/api";
import { adminApi, isResponse, readJson } from "@/lib/admin/api-guard";
import { editorial, jobs } from "@/lib/admin/population";
import { countryCodes } from "@/lib/edition";
import { audit } from "@/lib/audit";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const c = await adminApi(req, "editor");
  if (isResponse(c)) return c;
  return ok(await jobs(c.tenant, 20));
}

export async function POST(req: Request) {
  const c = await adminApi(req, "tenant_admin", { mutate: true, limit: 20 });
  if (isResponse(c)) return c;
  const b = await readJson(req);
  if (!b) return fail("INVALID", "JSON body required");
  const key = String(b.idempotency_key ?? "");
  if (!/^[A-Za-z0-9:_-]{8,120}$/.test(key)) return fail("INVALID", "idempotency_key required");
  const all = new Set(countryCodes());
  const countries = Array.isArray(b.countries) ? (b.countries as unknown[]).map(String).filter((x) => all.has(x)) : [];
  const body = { tenant_id: c.tenant.id, op: String(b.op ?? "create"), mode: String(b.mode ?? ""), countries, params: b.params ?? {},
    preview_hash: String(b.preview_hash ?? ""), idempotency_key: `${c.session.user.id}:${key}`, confirm: String(b.confirm ?? ""),
    scope_kind: String(b.scope_kind ?? "countries"), scope_label: String(b.scope_label ?? "").slice(0, 200), reason: String(b.reason ?? "").slice(0, 500),
    rollback_of: String(b.rollback_of ?? ""), actor: c.actor };
  const r = await editorial("/population/jobs", { method: "POST", body: JSON.stringify(body) });
  if (r.status === 200) {
    if (!r.body.replayed) await audit(c.tenant.id, c.actor.id, "population.job_requested", "population_jobs", r.body.job.id, { op: body.op, mode: body.mode, countries: countries.length });
    return ok(r.body);
  }
  if (r.status === 409 || r.status === 422) return NextResponse.json({ data: r.body, error: r.body.error }, { status: r.status });
  return fail("UNAVAILABLE", r.body?.error?.message ?? "Job service unavailable");
}
