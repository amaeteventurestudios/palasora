"use client";
// Command Center navigation (docs/specs/25 "Page shell"): grouped Overview / Audience / Agents & AI / Content & Regions /
// Economy / Commerce / Operations. Primary workspaces A01-A12 first in each group; existing tools remain as drilldowns.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, BarChart3, Bot, Building2, CandlestickChart, Coins, Cpu, FileBarChart, Globe2, Languages, LayoutDashboard, MapPin, Megaphone, MessagesSquare, Settings, Shield, SlidersHorizontal, TrendingUp, Users, Wallet, HeartPulse, ArrowLeft, UsersRound, Gauge, UserCog, Gamepad2 } from "lucide-react";
import { moduleForPath } from "@/lib/access/permissions";
import { Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarRail } from "@/components/ui/sidebar";

const GROUPS: { title: string; items: [string, string, React.ComponentType<{ className?: string }>][] }[] = [
  { title: "Overview", items: [["/admin", "Overview", LayoutDashboard], ["/admin/reports", "Reports & evidence", FileBarChart]] },
  { title: "Audience", items: [["/admin/audience", "Audience & retention", Users], ["/admin/geography", "Countries & languages", Globe2], ["/admin/analytics", "Event pipeline", BarChart3]] },
  { title: "Agents & AI", items: [["/admin/engine", "AI Engine overview", Globe2], ["/admin/engine/population", "Agent population", UsersRound], ["/admin/engine/controls", "Engine Control Room", Gauge], ["/admin/agent-city", "Agent City", Bot], ["/admin/models", "Models & Jev", Cpu], ["/admin/city", "City controls", SlidersHorizontal],
    ["/admin/conversations", "Conversations", MessagesSquare], ["/admin/ai", "Editorial AI runs", Activity]] },
  { title: "Content & Regions", items: [["/admin/social", "Social & SubPals", MessagesSquare],
    ["/admin/translations", "Translations", Languages], ["/admin/regions", "Regional priorities", MapPin], ["/admin/trends", "Trend audit", TrendingUp], ["/admin/moderation", "Moderation", Shield]] },
  { title: "Community", items: [["/admin/games", "Games", Gamepad2]] },
  { title: "Economy", items: [["/admin/sora", "Sora economy", Coins], ["/admin/exchange", "Virtual Exchange", CandlestickChart], ["/admin/town", "Town events", Building2]] },
  { title: "Commerce", items: [["/admin/revenue", "Revenue & business", Wallet], ["/admin/sponsors", "Sponsors & inquiries", Megaphone], ["/admin/advertising", "Advertising & inventory", Megaphone], ["/admin/businesses", "Businesses", Building2]] },
  { title: "Operations", items: [["/admin/ops", "Reliability & security", HeartPulse], ["/admin/infrastructure", "Infrastructure & services", HeartPulse], ["/admin/health", "System health", Activity], ["/admin/settings", "Settings & audit", Settings], ["/admin/users", "Users & access", UserCog]] },
];

// ISSUE-23: only links the person's role may open are shown (the server refuses the rest anyway).
export function AdminSidebar({ tenantName, user, role, viewable }: { tenantName: string; user: string; role: string; viewable: string[] }) {
  const allowed = new Set(viewable);
  const path = usePathname();
  const active = (href: string) => (href === "/admin" || href === "/admin/engine" ? path === href : path === href || path.startsWith(href + "/"));
  return (
    <Sidebar collapsible="icon" data-testid="admin-sidebar">
      <SidebarHeader>
        <div className="px-2 py-1 group-data-[collapsible=icon]:hidden">
          <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Command Center</p>
          <p className="truncate font-bold">{tenantName}</p>
          <p className="truncate text-xs text-muted-foreground" data-testid="admin-role">{user} · {role}</p>
        </div>
      </SidebarHeader>
      <SidebarContent>
        {GROUPS.map((g) => ({ ...g, items: g.items.filter(([href]) => allowed.has(moduleForPath(href) ?? "")) })).filter((g) => g.items.length > 0).map((g) => (
          <SidebarGroup key={g.title}>
            <SidebarGroupLabel>{g.title}</SidebarGroupLabel>
            <SidebarGroupContent><SidebarMenu>
              {g.items.map(([href, label, Icon]) => (
                <SidebarMenuItem key={href}>
                  <SidebarMenuButton asChild isActive={active(href)} tooltip={label}><Link href={href}><Icon className="size-4" />{label}</Link></SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu></SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarFooter><SidebarMenu><SidebarMenuItem><SidebarMenuButton asChild tooltip="Back to Palavva"><Link href="/"><ArrowLeft className="size-4" />Back to Palavva</Link></SidebarMenuButton></SidebarMenuItem></SidebarMenu></SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
