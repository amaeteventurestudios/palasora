// ISSUE-17: provider webhooks. Signature verified on the raw body; each provider event applied at most once.
import { handleWebhook } from "@/lib/payments/service";
export const dynamic = "force-dynamic";
export async function POST(req: Request, { params }: { params: Promise<{ provider: string }> }) {
  const raw = await req.text();
  const r = await handleWebhook((await params).provider, raw.slice(0, 200_000), req.headers);
  return Response.json({ outcome: r.outcome }, { status: r.status });
}
