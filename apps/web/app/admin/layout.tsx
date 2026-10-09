import Link from "next/link";
import { redirect } from "next/navigation";
import { Activity, BarChart3, Building2, Cpu, Inbox, LayoutDashboard, Megaphone, Rss, Settings, Share2, Shield, Users } from "lucide-react";
import { getTenant } from "@/lib/tenant";
import { getSession, isStaff } from "@/lib/session";
import { getSwitch } from "@/lib/settings";

export const metadata = { title: { default: "Command Center", template: "%s | Command Center" }, robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const NAV = [
  ["/admin", "Overview", LayoutDashboard], ["/admin/editorial", "Editorial Queue", Inbox], ["/admin/sources", "News Sources", Rss], ["/admin/ai", "AI Operations", Cpu],
  ["/admin/moderation", "Content & Moderation", Shield], ["/admin/analytics", "Audience Analytics", BarChart3], ["/admin/distribution", "Distribution & Search", Share2],
  ["/admin/sponsors", "Sponsors & Inquiries", Megaphone], ["/admin/businesses", "Businesses & Founders", Building2], ["/admin/tenants", "Tenants", Users],
  ["/admin/health", "System Health", Activity], ["/admin/settings", "Settings & Audit", Settings],
] as const;

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const tenant = await getTenant();
  const session = await getSession(tenant);
  if (!session) redirect("/auth/sign-in?next=/admin");
  if (!isStaff(session)) redirect("/forbidden");
  const paused = await getSwitch(tenant.id, "PUBLISHING_PAUSED");
  return (
    <div className="lg:flex">
      <aside className="bg-midnight text-white lg:min-h-screen lg:w-64 lg:shrink-0">
        <div className="p-4">
          <p className="text-xs uppercase tracking-wide text-white/75">Command Center</p>
          <p className="font-bold">{tenant.name}{tenant.isDemo ? " (demo tenant)" : ""}</p>
          <p className="text-xs text-white/75">Signed in as {session.user.display_name} · {session.role.replace("_", " ")}</p>
        </div>
        <nav aria-label="Command Center" className="scroll-row px-2 pb-3 lg:flex-col lg:overflow-visible">
          {NAV.map(([href, label, Icon]) => (
            <Link key={href} href={href} className="flex min-h-[44px] shrink-0 items-center gap-2 rounded-lg px-3 text-sm font-semibold text-white/90 hover:bg-white/10 hover:text-white">
              <Icon size={16} aria-hidden="true" />{label}
            </Link>
          ))}
        </nav>
      </aside>
      <div className="min-w-0 flex-1 p-4 sm:p-6">
        {paused && <p role="alert" className="mb-4 rounded-lg border border-[var(--danger)] bg-card p-3 font-semibold text-danger">Publishing paused for this tenant. Approvals are blocked until it is resumed in Settings.</p>}
        {children}
      </div>
    </div>
  );
}
