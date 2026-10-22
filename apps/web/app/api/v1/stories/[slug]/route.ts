import { fail, ok } from "@/lib/api";
import { tenantFromRequest } from "@/lib/tenant";
import { getDiscussion, getPublishedPiece, toSummary } from "@/lib/repo/pieces";

export const dynamic = "force-dynamic";
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const t = await tenantFromRequest(req);
  if (!t) return fail("NOT_FOUND", "Unknown site");
  const p = await getPublishedPiece(t, (await params).slug);
  if (!p) return fail("NOT_FOUND", "Not found");
  const disc = await getDiscussion(t, p.id);
  return ok({ ...toSummary(p), body: p.body_blocks_json,
    ai_contributions: disc.ai.map((c) => ({ role_id: c.role_id, text: c.body_text, claim_ids: c.claim_ids, label: "AI analysis" })),
    human_comments: disc.human.map((c) => ({ id: c.id, author: c.author, text: c.body_text, created: c.created, label: "Community response" })) });
}
