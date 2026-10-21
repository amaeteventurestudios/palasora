"use client";
import { useActionState, useState } from "react";
import { setTradingLimits, askWhy } from "@/app/actions/owner-economy";
import type { ActionState } from "@/app/actions/member";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";

export function TradingLimitsForm({ agentId, limits }: { agentId: string; limits: { enabled: number; max_order_pals: number; daily_pals: number; daily_orders: number; markets: string } | null }) {
  const [s, act, pending] = useActionState<ActionState, FormData>(setTradingLimits, { ok: false, message: "" });
  const [on, setOn] = useState(!!limits?.enabled);
  const [maxOrder, setMaxOrder] = useState([limits?.max_order_pals ?? 100]);
  return (
    <form action={act} className="flex flex-col gap-4" data-testid="trading-limits">
      <input type="hidden" name="agent_id" value={agentId} /><input type="hidden" name="enabled" value={on ? "true" : "false"} />
      <input type="hidden" name="max_order_pals" value={maxOrder[0]} />
      <div className="flex items-center justify-between gap-3"><Label htmlFor="trade-on">Allow simulated trading</Label><Switch id="trade-on" checked={on} onCheckedChange={setOn} /></div>
      <div className="grid gap-2"><Label>Max Sora per order: {maxOrder[0]}</Label><Slider min={5} max={2000} step={5} value={maxOrder} onValueChange={setMaxOrder} disabled={!on} aria-label="Maximum Sora per order" /></div>
      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-1.5"><Label htmlFor="dp">Daily Sora limit</Label><Input id="dp" name="daily_pals" type="number" min={1} max={100000} defaultValue={limits?.daily_pals ?? 300} disabled={!on} /></div>
        <div className="grid gap-1.5"><Label htmlFor="do">Orders per day</Label><Input id="do" name="daily_orders" type="number" min={1} max={50} defaultValue={limits?.daily_orders ?? 3} disabled={!on} /></div>
      </div>
      <div className="grid gap-1.5"><Label htmlFor="mk">Allowed markets (ISO codes, comma-separated; empty = any)</Label><Input id="mk" name="markets" placeholder="NG, GH, SN" defaultValue={limits ? (JSON.parse(limits.markets || "[]") as string[]).join(", ") : ""} disabled={!on} /></div>
      <p className="text-xs text-muted-foreground">No borrowing, no leverage, no short selling. Sora is fictional and cannot be bought, withdrawn or converted to money or AI credits.</p>
      <div className="flex items-center gap-3"><Button disabled={pending}>{pending ? "Saving…" : "Save trading limits"}</Button>{s.message && <span role="status" className={s.ok ? "text-sm text-success" : "text-sm text-danger"}>{s.message}</span>}</div>
    </form>
  );
}

export function AskWhy({ agentId, handle }: { agentId: string; handle: string }) {
  const [s, act, pending] = useActionState<ActionState, FormData>(askWhy, { ok: false, message: "" });
  return (
    <form action={act} className="flex flex-col gap-2" data-testid="ask-why">
      <input type="hidden" name="agent_id" value={agentId} />
      <Label htmlFor="q">Ask {handle} about its Sora and trades</Label>
      <Textarea id="q" name="question" rows={2} maxLength={400} placeholder="Why did you buy or sell? How are my holdings doing?" />
      <div><Button size="sm" disabled={pending}>{pending ? "Your agent is thinking (local model)…" : "Ask"}</Button></div>
      {s.message && <p role="status" className={s.ok ? "rounded-lg border bg-muted p-3 text-sm" : "text-sm text-danger"}>{s.message}</p>}
      <p className="text-xs text-muted-foreground">Answers use only stored records (balance, holdings, decisions, rewards). If the answer would cite anything not in the records, it is withheld.</p>
    </form>
  );
}
