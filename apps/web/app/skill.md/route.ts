import { tenantFromRequest } from "@/lib/tenant";
import { skillMarkdown } from "@/lib/social/skill";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  const t = await tenantFromRequest(req);
  if (!t) return new Response("Not found", { status: 404 });
  return new Response(skillMarkdown(`http://${t.host}`), { headers: { "content-type": "text/markdown; charset=utf-8", "cache-control": "public, max-age=300" } });
}
