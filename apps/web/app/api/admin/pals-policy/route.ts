// POST /api/admin/pals-policy (ISSUE-14). One route, four actions:
//   preview  (moderator+): replay recorded reward events under a proposed policy; changes nothing.
//   apply    (tenant admin): bounded, reasoned, revision-checked change to reward rules / the network budget. Future rewards only.
//   rollback (tenant admin): restore the value before a given change, as a new audited change.
//   review   (moderator+): record a person's disposition of an integrity signal (signals are warnings, not proof).
// The economy service keeps before/after + preview; this route adds the Palavva audit row with the acting person.
import { ok, fail } from "@/lib/api";
import { adminApi, isResponse, readJson } from "@/lib/admin/api-guard";
import { editorialCall } from "@/lib/editorial-client";
import { audit } from "@/lib/audit";
import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";

const refuse = (r: { status: number; code: string; message: string }) => NextResponse.json({ data: null, error: { code: r.code, message: r.message } }, { status: r.status === 503 ? 503 : r.status === 404 ? 404 : r.status === 409 ? 409 : 422 });

function proposalOf(b: Record<string, unknown>) {
  const rules: Record<string, { amount?: number; cap?: number; active?: boolean }> = {};
  for (const [code, v] of Object.entries((b.rules ?? {}) as Record<string, Record<string, unknown>>).slice(0, 20)) {
    if (!/^[a-z_]{3,40}$/.test(code) || typeof v !== "object" || !v) continue;
    const r: { amount?: number; cap?: number; active?: boolean } = {};
    if (v.amount !== undefined) r.amount = Number(v.amount);
    if (v.cap !== undefined) r.cap = Number(v.cap);
    if (v.active !== undefined) r.active = v.active === true;
    if (Object.keys(r).length) rules[code] = r;
  }
  return { rules, ...(b.budget !== undefined && b.budget !== null && b.budget !== "" ? { budget: Number(b.budget) } : {}), confirm_large: b.confirm_large === true };
}

export async function POST(req: Request) {
  const b = (await readJson(req)) as Record<string, unknown> | null;
  if (!b) return fail("INVALID", "JSON body required");
  const action = String(b.action ?? "");
  const need = action === "apply" || action === "rollback" ? "administer" : "approve";
  const c = await adminApi(req, "economy", need, { mutate: action !== "preview", limit: 30 });
  if (isResponse(c)) return c;
  const post = <T,>(path: string, body: unknown) => editorialCall<T>(`/economy${path}`, { method: "POST", body: JSON.stringify(body) }, 15000);
  if (action === "preview") {
    const r = await post("/admin/rewards/preview?days=" + Math.max(1, Math.min(30, Number(b.days ?? 7) || 7)), proposalOf(b));
    return r.ok ? ok(r.data) : refuse(r);
  }
  if (action === "apply") {
    const p = proposalOf(b);
    const r = await post<{ change_ids: number[]; revision: number }>("/admin/rewards/policy", { ...p, by: c.actor.id, reason: String(b.reason ?? "").slice(0, 1000), expected_revision: Number(b.expected_revision ?? -1) });
    if (!r.ok) return refuse(r);
    await audit(c.tenant.id, c.actor.id, "pals.policy_changed", "economy", r.data.change_ids.join(","), { proposal: p, reason: String(b.reason ?? "").slice(0, 500), revision: r.data.revision });
    return ok(r.data);
  }
  if (action === "rollback") {
    const id = Number(b.change_id);
    if (!Number.isInteger(id) || id < 1) return fail("INVALID", "change_id required");
    const r = await post<{ change_ids: number[]; revision: number }>(`/admin/rewards/policy/${id}/rollback`, { by: c.actor.id, reason: String(b.reason ?? "").slice(0, 1000), expected_revision: Number(b.expected_revision ?? -1) });
    if (!r.ok) return refuse(r);
    await audit(c.tenant.id, c.actor.id, "pals.policy_rolled_back", "economy", String(id), { reason: String(b.reason ?? "").slice(0, 500), revision: r.data.revision });
    return ok(r.data);
  }
  if (action === "review") {
    const key = String(b.signal_key ?? "").slice(0, 200), disposition = String(b.disposition ?? ""), note = String(b.note ?? "").slice(0, 1000);
    const r = await post("/admin/integrity/review", { signal_key: key, disposition, note, by: c.actor.id });
    if (!r.ok) return refuse(r);
    await audit(c.tenant.id, c.actor.id, "pals.integrity_reviewed", "economy", key, { disposition, note: note.slice(0, 300) });
    return ok(r.data);
  }
  return fail("INVALID", "Unknown action");
}
