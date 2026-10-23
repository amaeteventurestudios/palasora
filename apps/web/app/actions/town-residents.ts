"use server";
// Palasora: the residents directory. Reads go to the economy service with the signed-in person as the viewer (for
// "Following" and their own resident); following is the only change, and it is always made as the session's person.
import { getTenant } from "@/lib/tenant";
import { getSession } from "@/lib/session";
import { economyGet } from "@/lib/economy";
import { editorialCall } from "@/lib/editorial-client";
import { RESIDENT_ID, type Directory, type Resident, type ResidentFilter } from "@/lib/world/residents";

const FILTERS: ResidentFilter[] = ["all", "no_home", "no_job", "following"];

async function viewer(): Promise<string> {
  const session = await getSession(await getTenant());
  return session ? session.user.id : "";
}

export async function loadResidents(q = "", filter: ResidentFilter = "all", offset = 0): Promise<Directory | null> {
  const f = FILTERS.includes(filter) ? filter : "all";
  const v = await viewer();
  const sp = new URLSearchParams({ q: String(q).slice(0, 60), filter: f, offset: String(Math.max(0, Math.trunc(offset) || 0)), limit: "30" });
  if (v) sp.set("viewer", v);
  return economyGet<Directory>(`/town/residents?${sp}`);
}

export async function loadResident(id: string): Promise<Resident | null> {
  if (!RESIDENT_ID.test(id)) return null;
  const v = await viewer();
  return economyGet<Resident>(`/town/residents/${id}${v ? `?viewer=${encodeURIComponent(v)}` : ""}`);
}

export async function followResident(id: string, on: boolean): Promise<{ ok: boolean; following?: boolean; followers?: number; message?: string }> {
  if (!RESIDENT_ID.test(id)) return { ok: false, message: "No such resident." };
  const v = await viewer();
  if (!v) return { ok: false, message: "Sign in to follow residents." };
  const r = await editorialCall<{ following: boolean; followers: number }>(`/economy/town/residents/${id}/follow`, { method: "POST", body: JSON.stringify({ user_id: v, on: !!on }) }, 6000);
  return r.ok ? { ok: true, ...r.data } : { ok: false, message: r.code === "UNAVAILABLE" ? "The town is unreachable right now." : r.message };
}
