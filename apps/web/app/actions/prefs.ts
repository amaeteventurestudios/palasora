"use server";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { getTenant } from "@/lib/tenant";
import { getSession } from "@/lib/session";
import { pb } from "@/lib/pb";
import { PREFS_COOKIE, READING_ENABLED, UI_ENABLED, VIEW_COOKIE, allCountries, parsePrefs } from "@/lib/i18n/context";
import { safeNext } from "@/lib/format";
import { writeEvent } from "@/lib/analytics-server";
import type { ActionState } from "./member";

/** Explicit reader choices (23 §2). Stored first-party; synced to the account when signed in.
 *  `edition` alone switches the VIEWED edition for this browsing session; `save_home=1` also saves it as the home edition. */
export async function setPreferences(_: ActionState, f: FormData): Promise<ActionState> {
  const tenant = await getTenant();
  const jar = await cookies();
  const prev = parsePrefs(jar.get(PREFS_COOKIE)?.value);
  const ui = String(f.get("ui") ?? ""), reading = String(f.get("reading") ?? ""), edition = String(f.get("edition") ?? "");
  const saveHome = f.get("save_home") === "1";
  const prevView = jar.get(VIEW_COOKIE)?.value ?? "";
  const next = { ...prev };
  if (ui) { if (!UI_ENABLED.includes(ui)) return { ok: false, message: "Unsupported interface language." }; next.ui = ui; }
  if (reading) { if (!READING_ENABLED.includes(reading)) return { ok: false, message: "Unsupported reading language." }; next.reading = reading; }
  if (edition && edition !== "ALL" && !allCountries()[edition]) return { ok: false, message: "Unknown edition." };
  if (edition && saveHome) next.edition = edition;
  const h = await headers();
  const secure = (h.get("x-forwarded-proto") ?? "http") === "https";
  jar.set(PREFS_COOKIE, JSON.stringify(next), { httpOnly: true, sameSite: "lax", secure, path: "/", maxAge: 365 * 86400 });
  if (edition) jar.set(VIEW_COOKIE, edition, { httpOnly: true, sameSite: "lax", secure, path: "/" }); // session cookie: view only
  if (edition && edition !== prevView) await writeEvent(tenant.id, { event_name: "country_viewed", country_code: edition });
  if (edition && saveHome && edition !== prev.edition) await writeEvent(tenant.id, { event_name: "home_country_saved", country_code: edition });
  const s = await getSession(tenant);
  if (s) await pb.update("users", s.user.id, { interface_locale: next.ui ?? "", reading_locale: next.reading ?? "", home_edition: next.edition ?? "", explicit_prefs: { ui: !!next.ui, reading: !!next.reading, edition: !!next.edition } });
  if (ui && ui !== prev.ui) await writeEvent(tenant.id, { event_name: "interface_language_changed" });
  if (reading && reading !== prev.reading) await writeEvent(tenant.id, { event_name: "reading_language_changed" });
  if (edition && saveHome && edition !== prev.edition) await writeEvent(tenant.id, { event_name: "edition_manually_changed" });
  const dest = safeNext(f.get("next"));
  if (f.get("js") === "1") return { ok: true, message: "saved", data: { next: dest } };
  redirect(dest);
}
