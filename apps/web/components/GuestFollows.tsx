"use client";
import Link from "next/link";
import { useEffect, useState } from "react";

const KEY = "pv_guest_follows";
type F = { type: "country" | "area" | "topic"; id: string; label: string };
/** Guest follows live only in this browser (no account, no server copy). Sign in to sync across devices. */
export function GuestFollows({ suggestions }: { suggestions: F[] }) {
  const [items, setItems] = useState<F[]>([]);
  useEffect(() => { try { setItems(JSON.parse(localStorage.getItem(KEY) ?? "[]")); } catch { /* storage blocked */ } }, []);
  const save = (xs: F[]) => { setItems(xs); try { localStorage.setItem(KEY, JSON.stringify(xs)); } catch { /* ignore */ } };
  const href = (f: F) => (f.type === "area" ? `/local-pulse?country=${f.id.slice(0, 2)}&area=${f.id}` : f.type === "topic" ? `/topic/${f.id}` : `/local-pulse?country=${f.id}`);
  return (
    <div data-testid="guest-follows">
      {items.length === 0 ? <p className="text-sm text-muted-foreground">You are not following any places yet.</p> : (
        <ul className="flex flex-wrap gap-2">{items.map((f) => (
          <li key={`${f.type}:${f.id}`} className="chip"><Link href={href(f)}>{f.label}</Link>
            <button type="button" aria-label={`Unfollow ${f.label}`} onClick={() => save(items.filter((x) => !(x.type === f.type && x.id === f.id)))}>×</button></li>))}</ul>
      )}
      <p className="field-label mt-4">Follow a place on this device</p>
      <div className="flex flex-wrap gap-2">{suggestions.filter((s) => !items.some((x) => x.type === s.type && x.id === s.id)).map((s) => (
        <button key={`${s.type}:${s.id}`} type="button" className="chip" onClick={() => save([...items, s])}>+ {s.label}</button>))}</div>
    </div>
  );
}
