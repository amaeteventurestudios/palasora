import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import { tenantBySlug, tenantSlugForHost } from "@/lib/tenant";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

export default async function robots(): Promise<MetadataRoute.Robots> {
  const host = (await headers()).get("host") ?? "";
  const slug = tenantSlugForHost(host);
  const t = slug ? await tenantBySlug(slug, host) : null;
  // Local/staging and demo tenants are never indexable (14 §URL rules).
  if (!t || t.isDemo || !env.publicLaunchAuthorized) {
    return { rules: [{ userAgent: "*", disallow: "/" }], sitemap: `http://${host}/sitemap.xml` };
  }
  return { rules: [{ userAgent: "*", allow: "/", disallow: ["/admin", "/account", "/saved", "/following", "/submit", "/notifications", "/auth", "/api", "/search"] }], sitemap: `http://${host}/sitemap.xml` };
}
