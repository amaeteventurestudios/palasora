// POST /api/admin/engine-config/preview: validated before/after diff of proposed changes, nothing saved.
import { NextResponse } from "next/server";
import { ok, fail } from "@/lib/api";
import { adminApi, isResponse, readJson } from "@/lib/admin/api-guard";
import { editorial } from "@/lib/admin/population";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const c = await adminApi(req, "agents", "administer", { mutate: true, limit: 120 });
  if (isResponse(c)) return c;
  const b = await readJson(req);
  if (!b) return fail("INVALID", "JSON body required");
  const r = await editorial("/engine-config/preview", { method: "POST", body: JSON.stringify({ tenant_id: c.tenant.id, changes: Array.isArray(b.changes) ? b.changes.slice(0, 600) : [] }) });
  if (r.status === 200) return ok(r.body);
  if (r.status === 422) return NextResponse.json({ data: r.body, error: r.body.error }, { status: 422 });
  return fail("UNAVAILABLE", "Editorial service unavailable");
}
