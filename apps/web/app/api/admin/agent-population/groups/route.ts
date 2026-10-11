// POST /api/admin/agent-population/groups {action: save|delete, id?, name, codes, description}: saved country selections.
// Regional groups are system rows (read-only); custom groups, including the seeded Priority Growth Markets, are editable.
import { ok, fail } from "@/lib/api";
import { adminApi, isResponse, readJson } from "@/lib/admin/api-guard";
import { pb, q } from "@/lib/pb";
import { countryCodes } from "@/lib/edition";
import { audit } from "@/lib/audit";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const c = await adminApi(req, "tenant_admin", { mutate: true });
  if (isResponse(c)) return c;
  const b = await readJson(req);
  if (!b) return fail("INVALID", "JSON body required");
  const id = String(b.id ?? "");
  const existing = id ? await pb.get("country_groups", id) : null;
  if (id && (!existing || existing.tenant_id !== c.tenant.id)) return fail("NOT_FOUND", "No such group");
  if (existing?.kind === "system") return fail("FORBIDDEN", "Regional groups follow the country registry and cannot be edited");
  if (b.action === "delete") {
    if (!existing) return fail("INVALID", "id required");
    await pb.remove("country_groups", existing.id);
    await audit(c.tenant.id, c.actor.id, "country_group.deleted", "country_groups", existing.id, { name: existing.name });
    return ok({ deleted: existing.id });
  }
  const all = new Set(countryCodes());
  const codes = [...new Set((Array.isArray(b.codes) ? b.codes : []).map(String).filter((x: string) => all.has(x)))].sort();
  const name = String(b.name ?? "").trim().slice(0, 80);
  if (name.length < 2 || !codes.length) return fail("INVALID", "A name and at least one country are required");
  const slug = existing?.slug ?? name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50);
  if (!existing && await pb.first("country_groups", `tenant_id=${q(c.tenant.id)} && slug=${q(slug)}`)) return fail("CONFLICT", "A group with that name exists");
  const data = { tenant_id: c.tenant.id, slug, name, codes, description: String(b.description ?? "").slice(0, 400), kind: "custom", updated_by: c.actor.name };
  const r = existing ? await pb.update("country_groups", existing.id, data) : await pb.create("country_groups", data);
  await audit(c.tenant.id, c.actor.id, existing ? "country_group.updated" : "country_group.created", "country_groups", r.id, { name, codes });
  return ok(r);
}
