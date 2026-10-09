import { safeExternalUrl } from "@/lib/url-safety";
import { fail, ok } from "@/lib/api";
import { tenantFromRequest } from "@/lib/tenant";
import { pb, q } from "@/lib/pb";
export const dynamic = "force-dynamic";
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const t = await tenantFromRequest(req);
  if (!t) return fail("NOT_FOUND", "Unknown site");
  const s = (await params).slug;
  if (!/^[a-z0-9-]{1,80}$/.test(s)) return fail("NOT_FOUND", "Not found");
  const b = await pb.first("businesses", `tenant_id=${q(t.id)} && slug=${q(s)} && profile_status='published'`);
  if (!b) return fail("NOT_FOUND", "Not found");
  return ok({ name: b.name, slug: b.slug, country_code: b.country_code, topics: b.topic_slugs, website: b.website ? safeExternalUrl(b.website) : null, about: b.about, verification_state: b.verification_state, is_demo: b.is_demo });
}
