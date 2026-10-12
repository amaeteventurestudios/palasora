// ISSUE-17: start a credit purchase. Signed-in users only; same-origin; idempotent per client key. Sandbox unless live
// payments are explicitly authorised and configured (they are not).
import { NextResponse } from "next/server";
import { tenantFromRequest } from "@/lib/tenant";
import { getSession } from "@/lib/session";
import { createCreditOrder, PaymentError } from "@/lib/payments/service";
import { liveAuthorized } from "@/lib/payments/core";
export const dynamic = "force-dynamic";
export async function POST(req: Request) {
  const t = await tenantFromRequest(req);
  if (!t) return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
  const session = await getSession(t);
  if (!session) return NextResponse.json({ error: { code: "UNAUTHENTICATED", message: "Sign in to buy credits" } }, { status: 401 });
  const origin = req.headers.get("origin");
  if (origin && new URL(origin).host !== req.headers.get("host")) return NextResponse.json({ error: { code: "FORBIDDEN", message: "Cross-site request refused" } }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const provider = liveAuthorized() ? String(b.provider ?? "paystack") : "sandbox";
  try {
    const o = await createCreditOrder(t, session.user.id, String(b.currency ?? "NGN"), Number(b.pack ?? 0), provider, String(b.idempotency_key ?? "").replace(/[^A-Za-z0-9-]/g, "").slice(0, 60) || crypto.randomUUID());
    return NextResponse.json({ data: { id: o.id, status: o.status, sandbox: o.sandbox, checkout_url: o.sandbox ? `/payments/sandbox/${o.id}` : null } });
  } catch (e) {
    const err = e as PaymentError;
    return NextResponse.json({ error: { code: err.code ?? "ERROR", message: err.message } }, { status: err.code === "UNAVAILABLE" ? 503 : 422 });
  }
}
