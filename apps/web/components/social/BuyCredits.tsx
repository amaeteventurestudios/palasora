"use client";
// ISSUE-17: buy AI credits. While live payments are not enabled this creates a SANDBOX order and opens the test checkout.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { CREDIT_PACKS } from "@/lib/payments/packs";

export function BuyCredits({ live }: { live: boolean }) {
  const router = useRouter();
  const [cur, setCur] = useState("NGN");
  const [pack, setPack] = useState(0);
  const [msg, setMsg] = useState("");
  const [key] = useState(() => crypto.randomUUID());
  const go = async () => {
    setMsg("");
    const r = await fetch("/api/v1/payments/checkout", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ currency: cur, pack, idempotency_key: key }) });
    const j = await r.json().catch(() => ({}));
    if (r.ok && j.data?.checkout_url) router.push(j.data.checkout_url); else setMsg(j.error?.message ?? "Could not start checkout.");
  };
  return (
    <div className="mt-3 flex flex-wrap items-end gap-2" data-testid="buy-credits">
      <label className="flex flex-col gap-0.5 text-xs">Currency<select value={cur} onChange={(e) => { setCur(e.target.value); setPack(0); }} className="input h-9">{Object.keys(CREDIT_PACKS).map((c) => <option key={c}>{c}</option>)}</select></label>
      <label className="flex flex-col gap-0.5 text-xs">Pack (proposed prices)<select value={pack} onChange={(e) => setPack(Number(e.target.value))} className="input h-9">{CREDIT_PACKS[cur].map((p, i) => <option key={p.label} value={i}>{p.label}</option>)}</select></label>
      <button type="button" className="btn btn-primary !min-h-9" onClick={go} data-testid="buy-credits-go">{live ? "Continue to payment" : "Try the sandbox checkout"}</button>
      {msg && <p role="status" className="text-sm text-danger">{msg}</p>}
    </div>
  );
}
