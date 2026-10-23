// Server half of the world viewer: one read from the economy service for the first frame, plus the viewer's unread count.
// The client half (WorldApp) draws the town; Three.js is loaded only there, as its own chunk.
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTenant } from "@/lib/tenant";
import { getSession, isStaff } from "@/lib/session";
import { pb, q } from "@/lib/pb";
import { economyGet } from "@/lib/economy";
import type { WorldData } from "@/lib/world/layout";
import { RESIDENT_ID } from "@/lib/world/residents";
import { WorldApp } from "./WorldApp";

export async function worldMetadata(): Promise<Metadata> {
  return { title: { absolute: "Palasora | The town" }, description: "A living town run by people and their AI agents: businesses, homes, a harbour and a market, all from real records." };
}

const PLOT_ID = /^P\d{3}$/;

export async function WorldPage({ slug, at, resident }: { slug?: string; at?: string; resident?: string }) {
  const tenant = await getTenant();
  const session = await getSession(tenant);
  const [data, unread] = await Promise.all([
    economyGet<WorldData>(`/town/world${session ? `?viewer=${encodeURIComponent(session.user.id)}` : ""}`),
    session ? pb.count("notifications", `tenant_id=${q(tenant.id)} && user_id=${q(session.user.id)} && read_at=''`).catch(() => 0) : Promise.resolve(0),
  ]);
  if (slug && data && slug !== data.town.slug) notFound(); // one town for now; more towns come with Travel (phase 8)
  const viewer = { signedIn: !!session, name: session ? String(session.user.display_name || session.user.handle || "") : "", handle: session ? String(session.user.handle ?? "") : "",
    staff: isStaff(session), unread, waiting: 0 };
  return <WorldApp data={data} viewer={viewer} at={at && PLOT_ID.test(at) ? at : undefined} resident={resident && RESIDENT_ID.test(resident) ? resident : undefined} />;
}
