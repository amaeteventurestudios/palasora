// POST /api/admin/agent-population/preview: exact deltas from real counts, no writes (tenant admins).
import { ok, fail } from "@/lib/api";
import { adminApi, isResponse, readJson } from "@/lib/admin/api-guard";
import { editorial } from "@/lib/admin/population";
import { countryCodes } from "@/lib/edition";
export const dynamic = "force-dynamic";

const OPS = ["create", "activate", "pause", "resume", "deactivate", "retire"];
const MODES = ["set_target", "add_n", "distribute_n", ""];

export async function POST(req: Request) {
  const c = await adminApi(req, "tenant_admin", { mutate: true, limit: 120 });
  if (isResponse(c)) return c;
  const b = await readJson(req);
  if (!b) return fail("INVALID", "JSON body required");
  const op = String(b.op ?? "create"), mode = String(b.mode ?? "");
  const all = new Set(countryCodes());
  const countries = Array.isArray(b.countries) ? (b.countries as unknown[]).map(String).filter((x) => all.has(x)) : [];
  if (!OPS.includes(op) || !MODES.includes(mode) || !countries.length) return fail("INVALID", "op, mode and at least one known country required");
  const r = await editorial("/population/preview", { method: "POST", body: JSON.stringify({ tenant_id: c.tenant.id, op, mode, countries, params: b.params ?? {} }) });
  if (r.status !== 200) return fail("UNAVAILABLE", r.body?.error?.message ?? "Preview failed");
  return ok(r.body);
}
