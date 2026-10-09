"use server";
import { safeExternalUrl } from "@/lib/url-safety";
import { headers } from "next/headers";
import { randomBytes } from "node:crypto";
import { getTenant } from "@/lib/tenant";
import { pb, pbDate } from "@/lib/pb";
import { rateLimit, clientKey } from "@/lib/ratelimit";
import { forwardInquiry } from "@/lib/crm";
import { audit } from "@/lib/audit";
import { writeEvent } from "@/lib/analytics-server";
import type { ActionState } from "./member";

const s = (f: FormData, k: string, max: number) => String(f.get(k) ?? "").slice(0, max).trim();

export async function submitInquiry(_: ActionState, f: FormData): Promise<ActionState> {
  const tenant = await getTenant();
  const h = await headers();
  const ip = clientKey(h);
  if (!rateLimit(`inquiry:${ip}`, 3, 600_000).ok) return { ok: false, message: "Too many requests for now. Please try again shortly." };
  // Honeypot: real people never fill the hidden "company_url" field.
  if (s(f, "company_url", 200)) return { ok: true, message: "Your inquiry has been received." };
  const name = s(f, "contact_name", 120), email = s(f, "email", 200).toLowerCase(), business = s(f, "business", 200);
  const website = s(f, "website", 300);
  if (!name) return { ok: false, message: "Tell us your name.", field: "contact_name" };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, message: "Enter a valid work email.", field: "email" };
  if (!business) return { ok: false, message: "Tell us the business or organization.", field: "business" };
  if (website && !safeExternalUrl(website)) return { ok: false, message: "Enter a public website address starting with https://", field: "website" };
  if (f.get("consent") !== "on") return { ok: false, message: "Please confirm we may contact you about this inquiry.", field: "consent" };
  const reference = `PV-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${randomBytes(3).toString("hex").toUpperCase()}`;
  let inq;
  try {
    inq = await pb.create("sponsor_inquiries", {
      tenant_id: tenant.id, reference, contact_name: name, email, business, website, region: s(f, "region", 100), industry: s(f, "industry", 100),
      promote: s(f, "promote", 2000), budget_range: s(f, "budget_range", 50), message: s(f, "message", 4000), consent_at: pbDate(),
      forward_state: "PENDING_FORWARD", attempts: 0,
    });
  } catch {
    return { ok: false, message: "We couldn't send your inquiry. Your information hasn't been lost if a confirmation reference is shown. Please retry or contact us through Help." };
  }
  // Persisted: the reference is now safe to show. Forwarding failure does not lose the lead.
  await audit(tenant.id, "anonymous", "inquiry.create", "sponsor_inquiries", inq.id, { reference });
  await writeEvent(tenant.id, { event_name: "inquiry_created" });
  await forwardInquiry(inq).catch(() => undefined);
  return { ok: true, message: `Your inquiry has been received. Reference: ${reference}. We'll review it and respond using the contact details you provided.`, data: { reference } };
}
