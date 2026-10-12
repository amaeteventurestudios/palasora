import { tenantFromRequest } from "@/lib/tenant";
import { launched, llmsTxt } from "@/lib/seo/llms";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  const t = await tenantFromRequest(req);
  if (!t) return new Response("Not found", { status: 404 });
  return new Response(llmsTxt(`http://${t.host}`, t), { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=3600",
    ...(launched(t) ? {} : { "x-robots-tag": "noindex" }) } });
}
