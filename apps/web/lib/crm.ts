// EspoCRM bridge (12-SPONSORS). The inquiry is ALWAYS persisted locally first; forwarding is
// a separate, retriable step. With no configured URL/key the state is NOT_CONFIGURED: no network call.
import { env } from "./env";
import { pb, pbDate, type Rec } from "./pb";

export type ForwardResult = { state: "FORWARDED" | "FORWARD_FAILED" | "NOT_CONFIGURED"; crmRef?: string; error?: string };

export async function forwardInquiry(inq: Rec): Promise<ForwardResult> {
  if (!env.espoConfigured) {
    await pb.update("sponsor_inquiries", inq.id, { forward_state: "NOT_CONFIGURED", last_error: "EspoCRM bridge not configured" });
    return { state: "NOT_CONFIGURED" };
  }
  const attempts = (inq.attempts ?? 0) + 1;
  try {
    const [first, ...rest] = String(inq.contact_name).split(" ");
    const r = await fetch(`${process.env.ESPOCRM_URL!.replace(/\/$/, "")}/api/v1/Lead`, {
      method: "POST", signal: AbortSignal.timeout(8000),
      headers: { "content-type": "application/json", "X-Api-Key": process.env.ESPOCRM_API_KEY! },
      // Only the permitted fields; the Palavva reference is the idempotent correlation key.
      body: JSON.stringify({ firstName: first, lastName: rest.join(" ") || "-", emailAddress: inq.email, accountName: inq.business, website: inq.website,
        source: "Web Site", description: `[Palavva ${inq.reference}] ${inq.industry} / ${inq.region}\n${inq.promote}\n${inq.message}` }),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const j = await r.json();
    await pb.update("sponsor_inquiries", inq.id, { forward_state: "FORWARDED", crm_ref: String(j.id ?? ""), attempts, last_error: "" });
    return { state: "FORWARDED", crmRef: String(j.id ?? "") };
  } catch (e) {
    const backoff = Math.min(3600, 60 * 2 ** attempts);
    await pb.update("sponsor_inquiries", inq.id, { forward_state: "FORWARD_FAILED", attempts, last_error: String((e as Error).message).slice(0, 200),
      next_attempt_at: pbDate(new Date(Date.now() + backoff * 1000)) });
    return { state: "FORWARD_FAILED", error: (e as Error).message };
  }
}
