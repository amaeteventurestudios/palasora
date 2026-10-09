// Host → tenant resolution from a trusted server-side allowlist (TENANT_HOSTS).
// Client-supplied tenant identifiers are never accepted. Unknown hosts fail closed.
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { env } from "./env";
import { pb, q, type Rec } from "./pb";

export type Branding = { wordmark_text: string; primary_color: string; accent_color: string; masthead_color: string; theme: string };
export type Tenant = { id: string; slug: string; name: string; host: string; isDemo: boolean; branding: Branding; features: Record<string, boolean>; quotas: Record<string, number> };

const cache = new Map<string, { at: number; t: Tenant }>();

const HEX = /^#[0-9a-fA-F]{6}$/;
export function safeBranding(b: Partial<Branding> | undefined): Branding {
  // Only plain 6-digit hex colors survive: prevents CSS injection through tenant config.
  const pick = (v: unknown, d: string) => (typeof v === "string" && HEX.test(v) ? v : d);
  return {
    wordmark_text: typeof b?.wordmark_text === "string" ? b.wordmark_text.slice(0, 60) : "palavva",
    primary_color: pick(b?.primary_color, "#C34218"),
    accent_color: pick(b?.accent_color, "#E85E31"),
    masthead_color: pick(b?.masthead_color, "#1B2030"),
    theme: b?.theme === "light" || b?.theme === "dark" ? b.theme : "system",
  };
}

export function tenantSlugForHost(host: string | null | undefined): string | null {
  if (!host) return null;
  return env.tenantHosts[host.toLowerCase()] ?? null;
}

export async function tenantBySlug(slug: string, host = ""): Promise<Tenant | null> {
  const hit = cache.get(slug);
  if (hit && Date.now() - hit.at < 30_000) return { ...hit.t, host: host || hit.t.host };
  const r: Rec | null = await pb.first("tenants", `slug=${q(slug)} && status='active'`);
  if (!r) return null;
  const t: Tenant = {
    id: r.id, slug: r.slug, name: r.name, host: host || r.canonical_host, isDemo: !!r.is_demo,
    branding: safeBranding(r.branding_json), features: r.enabled_features ?? {}, quotas: r.quotas_json ?? {},
  };
  cache.set(slug, { at: Date.now(), t });
  return t;
}

/** Resolve the tenant for the current request or render a generic 404. */
export async function getTenant(): Promise<Tenant> {
  const h = await headers();
  const host = h.get("host");
  const slug = tenantSlugForHost(host);
  if (!slug) notFound();
  const t = await tenantBySlug(slug, host!);
  if (!t) notFound();
  return t;
}

/** Same as getTenant but returns null instead of throwing (for route handlers). */
export async function tenantFromRequest(req: Request): Promise<Tenant | null> {
  const host = req.headers.get("host");
  const slug = tenantSlugForHost(host);
  if (!slug) return null;
  return tenantBySlug(slug, host!);
}

export function originFor(t: Tenant): string {
  return `http://${t.host}`;
}
