import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getTenant } from "@/lib/tenant";
import { getSession, isStaff } from "@/lib/session";
import { getSwitch } from "@/lib/settings";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { AdminSidebar } from "@/components/admin/AdminSidebar";

export const metadata = { title: { default: "Command Center", template: "%s | Command Center" }, robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const tenant = await getTenant();
  const session = await getSession(tenant);
  if (!session) redirect("/auth/sign-in?next=/admin");
  if (!isStaff(session)) redirect("/forbidden");
  const [paused, jar] = await Promise.all([getSwitch(tenant.id, "PUBLISHING_PAUSED"), cookies()]);
  const open = jar.get("sidebar_state")?.value !== "false";
  return (
    <SidebarProvider defaultOpen={open}>
      <AdminSidebar tenantName={`${tenant.name}${tenant.isDemo ? " (demo tenant)" : ""}`} user={session.user.display_name} role={session.role} />
      <SidebarInset>
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-background/95 px-3 backdrop-blur sm:px-4">
          <SidebarTrigger aria-label="Toggle Command Center navigation" />
          <Separator orientation="vertical" className="h-5" />
          <p className="font-semibold">Command Center</p>
          <Badge variant="outline" className="ms-1">local development</Badge>
          <form action="/search" method="get" role="search" className="ms-auto hidden md:block"><label htmlFor="adm-q" className="sr-only">Search public content</label>
            <input id="adm-q" name="q" placeholder="Search content…" className="h-8 w-56 rounded-md border bg-background px-2 text-sm" /></form>
        </header>
        <div className="min-w-0 p-3 sm:p-6">
          {paused && <p role="alert" className="mb-4 rounded-lg border border-[var(--danger)] bg-card p-3 font-semibold text-danger">Publishing paused for this tenant. Approvals are blocked until it is resumed in Settings.</p>}
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
