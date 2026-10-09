"use client";
import { useActionState } from "react";
import { submitInquiry } from "@/app/actions/commerce";
import type { ActionState } from "@/app/actions/member";

function F({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return <div><label className="field-label" htmlFor={id}>{label}</label>{children}</div>;
}

export function InquiryForm({ industries, countries, preset }: { industries: string[]; countries: string[]; preset?: string }) {
  const [s, a, p] = useActionState<ActionState, FormData>(submitInquiry, { ok: false, message: "" });
  if (s.ok) return <p role="status" className="rounded-xl bg-card-muted p-5 font-semibold" data-testid="inquiry-success">{s.message}</p>;
  return (
    <form action={a} className="grid gap-4 sm:grid-cols-2">
      <F id="contact_name" label="Your name"><input id="contact_name" name="contact_name" required maxLength={120} className="input" autoComplete="name" /></F>
      <F id="email" label="Work email"><input id="email" name="email" type="email" required maxLength={200} className="input" autoComplete="email" /></F>
      <F id="business" label="Business or organization"><input id="business" name="business" required maxLength={200} className="input" autoComplete="organization" /></F>
      <F id="website" label="Website (optional)"><input id="website" name="website" type="url" maxLength={300} className="input" placeholder="https://" /></F>
      <F id="region" label="Country/region"><select id="region" name="region" className="input" defaultValue=""><option value="">Choose…</option>{countries.map((c) => <option key={c}>{c}</option>)}<option>Multiple countries</option></select></F>
      <F id="industry" label="Industry"><select id="industry" name="industry" className="input" defaultValue={preset === "white-label" ? "White-label (future)" : ""}><option value="">Choose…</option>{industries.map((c) => <option key={c}>{c}</option>)}<option>White-label (future)</option></select></F>
      <div className="sm:col-span-2"><F id="promote" label="What would you like to promote?"><textarea id="promote" name="promote" rows={2} maxLength={2000} className="input" /></F></div>
      <F id="budget_range" label="Budget range (optional)"><select id="budget_range" name="budget_range" className="input" defaultValue=""><option value="">Prefer not to say</option><option>Under $250</option><option>$250–$1,000</option><option>$1,000–$2,000</option><option>Over $2,000</option></select></F>
      <div className="sm:col-span-2"><F id="message" label="How can we help?"><textarea id="message" name="message" rows={4} maxLength={4000} className="input" /></F></div>
      <div aria-hidden="true" className="absolute left-[-9999px]"><label htmlFor="company_url">Leave empty</label><input id="company_url" name="company_url" tabIndex={-1} autoComplete="off" /></div>
      <label className="flex items-start gap-2 text-sm sm:col-span-2"><input type="checkbox" name="consent" className="mt-1 h-5 w-5" />
        <span>I agree to be contacted about this inquiry and understand my details will be handled according to the Privacy Policy.</span></label>
      {s.message && <p role="alert" className="text-sm text-danger sm:col-span-2">{s.message}</p>}
      <div className="sm:col-span-2"><button className="btn btn-primary" disabled={p}>{p ? "Sending…" : "Send inquiry"}</button></div>
    </form>
  );
}
