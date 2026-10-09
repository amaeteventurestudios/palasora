import { ImageResponse } from "next/og";
import { tenantFromRequest } from "@/lib/tenant";
import { getPublishedPiece } from "@/lib/repo/pieces";

export const runtime = "nodejs";

/** 1200×630 type-led share card from the edited, approved headline (no stock photos, no AI imagery). */
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const t = await tenantFromRequest(req);
  if (!t) return new Response("Not found", { status: 404 });
  const { slug } = await params;
  const p = slug === "default" ? null : await getPublishedPiece(t, slug);
  if (slug !== "default" && !p) return new Response("Not found", { status: 404 });
  const headline = p?.headline ?? "Africa has a lot to talk about.";
  const kicker = p ? [...(p.country_codes ?? []), ...(p.topic_slugs ?? []).slice(0, 1)].join(" · ").toUpperCase() : "NEWS · HISTORY · IDEAS · CONVERSATION";
  const masthead = t.branding.masthead_color;
  const accent = t.branding.accent_color;
  const wordmark = t.slug === "palavva" ? "palavva" : t.branding.wordmark_text;
  return new ImageResponse(
    (
      <div style={{ width: 1200, height: 630, display: "flex", flexDirection: "column", background: "#F8F5F0", fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", alignItems: "center", height: 120, padding: "0 64px", background: masthead, borderBottom: `8px solid ${accent}` }}>
          <span style={{ color: "#FFFFFF", fontSize: 64, fontWeight: 800, letterSpacing: -2 }}>{wordmark}</span>
          {t.slug === "palavva" && <span style={{ color: accent, fontSize: 64, fontWeight: 800 }}>.</span>}
        </div>
        <div style={{ display: "flex", flexDirection: "column", padding: "48px 64px", flex: 1 }}>
          <span style={{ color: "#A83813", fontSize: 26, fontWeight: 700, letterSpacing: 1 }}>{kicker}</span>
          <span style={{ color: "#1B2030", fontSize: headline.length > 90 ? 50 : 62, fontWeight: 800, lineHeight: 1.12, marginTop: 18 }}>{headline}</span>
          <div style={{ display: "flex", marginTop: "auto", alignItems: "center", gap: 16 }}>
            <span style={{ color: "#616675", fontSize: 24 }}>{p?.is_demo ? "Demo content · not real news" : "Sourced explanation · read the original sources"}</span>
          </div>
        </div>
      </div>
    ),
    { width: 1200, height: 630, headers: { "cache-control": "public, max-age=300" } },
  );
}
