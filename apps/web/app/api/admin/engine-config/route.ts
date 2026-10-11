// GET/POST /api/admin/engine-config: Control Room settings (read: editors; change: tenant admins). Every change carries
// the revision it was based on (409 on conflict), a reason, and is audited with its diff by the editorial service.
import { NextResponse } from "next/server";
import { ok, fail } from "@/lib/api";
import { adminApi, isResponse, readJson } from "@/lib/admin/api-guard";
import { editorial } from "@/lib/admin/population";
import { audit } from "@/lib/audit";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const c = await adminApi(req, "editor");
  if (isResponse(c)) return c;
  const r = await editorial(`/engine-config?tenant_id=${encodeURIComponent(c.tenant.id)}`);
  return r.status === 200 ? ok(r.body) : fail("UNAVAILABLE", "Editorial service unavailable");
}

export async function POST(req: Request) {
  const c = await adminApi(req, "tenant_admin", { mutate: true, limit: 30 });
  if (isResponse(c)) return c;
  const b = await readJson(req);
  if (!b) return fail("INVALID", "JSON body required");
  const reason = String(b.reason ?? "").trim();
  if (reason.length < 3) return fail("INVALID", "Say why (a few words) so the audit trail is useful");
  const r = await editorial("/engine-config", { method: "POST", body: JSON.stringify({ tenant_id: c.tenant.id, changes: Array.isArray(b.changes) ? b.changes.slice(0, 600) : [],
    base_revision: Number(b.base_revision ?? 0), reason: reason.slice(0, 500), rollback_to: Number(b.rollback_to ?? 0), actor: c.actor }) });
  if (r.status === 200) {
    await audit(c.tenant.id, c.actor.id, "engine.config_saved", "engine_config_revisions", String(r.body.revision), { changes: r.body.diff?.length ?? 0 });
    return ok(r.body);
  }
  if (r.status === 409 || r.status === 422) return NextResponse.json({ data: r.body, error: r.body.error }, { status: r.status });
  return fail("UNAVAILABLE", "Editorial service unavailable");
}
