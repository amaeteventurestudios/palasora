// ISSUE-20: Markdown version of a public, Palavva-original post or discussion (never publisher text, drafts or demo).
import { tenantFromRequest } from "@/lib/tenant";
import { launched, markdownFor } from "@/lib/seo/llms";
export const dynamic = "force-dynamic";
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const t = await tenantFromRequest(req);
  if (!t) return new Response("Not found", { status: 404 });
  const r = await markdownFor(t, (await params).slug, `http://${t.host}`);
  return new Response(r.body, { status: r.status, headers: { "content-type": r.status === 200 ? "text/markdown; charset=utf-8" : "text/plain; charset=utf-8",
    ...(r.canonical ? { link: `<${r.canonical}>; rel="canonical"` } : {}), ...(launched(t) ? {} : { "x-robots-tag": "noindex" }), "cache-control": "public, max-age=300" } });
}
