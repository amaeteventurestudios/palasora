import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import { tenantBySlug, tenantSlugForHost } from "@/lib/tenant";
import { pb, q } from "@/lib/pb";
import { parsePbDate } from "@/lib/format";
import { pieceHref } from "@/components/StoryCard";

export const dynamic = "force-dynamic";

/** Only published, rights-cleared, non-demo pieces on non-demo tenants. Drafts never appear. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const host = (await headers()).get("host") ?? "";
  const slug = tenantSlugForHost(host);
  const t = slug ? await tenantBySlug(slug, host) : null;
  if (!t || t.isDemo) return [];
  const base = `http://${host}`;
  const rows = await pb.list("editorial_pieces", { filter: `tenant_id=${q(t.id)} && review_status='published' && is_demo=false`, sort: "-published_at", perPage: 500 });
  const statics = ["/", "/discover", "/countries", "/topics", "/about", "/editorial", "/ai-transparency", "/corrections", "/founders", "/advertise"];
  return [
    ...statics.map((p) => ({ url: `${base}${p}`, changeFrequency: "daily" as const })),
    ...rows.map((r) => ({ url: `${base}${pieceHref(r)}`, lastModified: parsePbDate(r.material_updated_at || r.published_at) ?? undefined })),
  ];
}
