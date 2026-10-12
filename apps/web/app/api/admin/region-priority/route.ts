// GET/POST /api/admin/region-priority (ISSUE-03). Read: editors. Change: tenant admins, CSRF, a reason, the revision it was
// based on (409 on conflict); audited with before/after per region. The engine picks the new weights up within ~30 s.
import { NextResponse } from "next/server";
import { ok, fail } from "@/lib/api";
import { pb } from "@/lib/pb";
import { adminApi, isResponse, readJson } from "@/lib/admin/api-guard";
import { KEY, clampWeight, regionWeights } from "@/lib/admin/regions";
import { audit } from "@/lib/audit";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const c = await adminApi(req, "editor");
  if (isResponse(c)) return c;
  return ok(await regionWeights(c.tenant));
}

export async function POST(req: Request) {
  const c = await adminApi(req, "tenant_admin", { mutate: true, limit: 30 });
  if (isResponse(c)) return c;
  const b = await readJson(req);
  if (!b || typeof b.weights !== "object" || !b.weights) return fail("INVALID", "weights object required");
  const reason = String(b.reason ?? "").trim();
  if (reason.length < 3) return fail("INVALID", "Say why (a few words) so the audit trail is useful");
  const cur = await regionWeights(c.tenant);
  if (Number(b.base_revision ?? -1) !== cur.revision) return NextResponse.json({ data: cur, error: { code: "CONFLICT", message: "Someone else changed the priorities; reload and try again" } }, { status: 409 });
  const diff: { region: string; before: number; after: number }[] = [];
  const next = { ...cur.stored };
  for (const [code, v] of Object.entries(b.weights as Record<string, unknown>).slice(0, 1000)) {
    if (!/^[A-Z]{2}-[A-Z0-9]{1,4}$/.test(code)) return fail("INVALID", `Not a region code: ${code}`);
    if (v === null || v === "" || !Number.isFinite(Number(v))) return fail("INVALID", `Weight for ${code} must be a number from 0 to 3`);
    const after = clampWeight(v);
    const before = cur.weights[code] ?? 1;
    if (after !== before) { diff.push({ region: code, before, after }); next[code] = after; }
  }
  if (!diff.length) return ok({ ...cur, changed: 0 });
  const value = { weights: next, revision: cur.revision + 1 };
  if (cur.id) await pb.update("tenant_settings", cur.id, { value }); else await pb.create("tenant_settings", { tenant_id: c.tenant.id, key: KEY, value });
  await audit(c.tenant.id, c.actor.id, "regions.priority_saved", "tenant_settings", KEY, { reason: reason.slice(0, 500), diff: diff.slice(0, 200), revision: value.revision });
  return ok({ ...(await regionWeights(c.tenant)), changed: diff.length });
}
