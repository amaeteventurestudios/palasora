import { requireMember } from "@/lib/guard";
export const metadata = { title: "Notifications", robots: { index: false } };
export const dynamic = "force-dynamic";
export default async function Notifications() {
  await requireMember("/notifications");
  return <div className="container-pv max-w-2xl py-8"><h1 className="text-3xl font-extrabold">Notifications</h1><p className="mt-3 text-muted-foreground">No notifications. Palavva only sends real updates, such as replies to your comments, once notifications are enabled.</p></div>;
}
