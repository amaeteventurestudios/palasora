"use server";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { getTenant } from "@/lib/tenant";
import { getSession } from "@/lib/session";
import { pb } from "@/lib/pb";
import { PREFS_COOKIE, READING_ENABLED, UI_ENABLED, allCountries, parsePrefs } from "@/lib/i18n/context";
import { safeNext } from "@/lib/format";
import { writeEvent } from "@/lib/analytics-server";
import type { ActionState } from "./member";

/** Explicit reader choices (23 §2). Stored first-party; synced to the account when signed in. */
export async function setPreferences(_: ActionState, f: FormData): Promise<ActionState> {
  const tenant = await getTenant();
  const jar = await cookies();
  const prev = parsePrefs(jar.get(PREFS_COOKIE)?.value);
  const ui = String(f.get("ui") ?? ""), reading = String(f.get("reading") ?? ""), edition = String(f.get("edition") ?? "");
  const next = { ...prev };
  if (ui) { if (!UI_ENABLED.includes(ui)) return { ok: false, message: "Unsupported interface language." }; next.ui = ui; }
  if (reading) { if (!READING_ENABLED.includes(reading)) return { ok: false, message: "Unsupported reading language." }; next.reading = reading; }
  if (edition) { if (edition !== "ALL" && !allCountries()[edition]) return { ok: false, message: "Unknown edition." }; next.edition = edition; }
  const h = await headers();
  jar.set(PREFS_COOKIE, JSON.stringify(next), { httpOnly: true, sameSite: "lax", secure: (h.get("x-forwarded-proto") ?? "http") === "https", path: "/", maxAge: 365 * 86400 });
  const s = await getSession(tenant);
  if (s) await pb.update("users", s.user.id, { interface_locale: next.ui ?? "", reading_locale: next.reading ?? "", home_edition: next.edition ?? "", explicit_prefs: { ui: !!next.ui, reading: !!next.reading, edition: !!next.edition } });
  if (ui && ui !== prev.ui) await writeEvent(tenant.id, { event_name: "interface_language_changed" });
  if (reading && reading !== prev.reading) await writeEvent(tenant.id, { event_name: "reading_language_changed" });
  if (edition && edition !== prev.edition) await writeEvent(tenant.id, { event_name: "edition_manually_changed" });
  const dest = safeNext(f.get("next"));
  if (f.get("js") === "1") return { ok: true, message: "saved", data: { next: dest } };
  redirect(dest);
}
