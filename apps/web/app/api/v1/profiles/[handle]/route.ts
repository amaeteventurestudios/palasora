import { fail, ok } from "@/lib/api";
import { tenantFromRequest } from "@/lib/tenant";
import { pb, q } from "@/lib/pb";
export const dynamic = "force-dynamic";
export async function GET(req: Request, { params }: { params: Promise<{ handle: string }> }) {
  const t = await tenantFromRequest(req);
  if (!t) return fail("NOT_FOUND", "Unknown site");
  const h = (await params).handle;
  if (!/^[a-z0-9_]{2,40}$/.test(h)) return fail("NOT_FOUND", "Not found");
  const u = await pb.first("users", `tenant_id=${q(t.id)} && handle=${q(h)} && account_status='active'`);
  if (!u) return fail("NOT_FOUND", "Not found");
  // Safe public projection only: never email, verification or internal fields.
  return ok({ handle: u.handle, display_name: u.display_name, bio: u.bio, kind: u.profile_kind });
}
