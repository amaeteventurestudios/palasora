"use client";
// Sub-navigation for the Palavva AI Engine workspace (spec 31): one Command Center area, three views.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, SlidersHorizontal, Users } from "lucide-react";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/admin/engine", label: "Overview", icon: Activity, exact: true },
  { href: "/admin/engine/population", label: "Population", icon: Users },
  { href: "/admin/engine/controls", label: "Control Room", icon: SlidersHorizontal },
];

export function EngineNav() {
  const path = usePathname();
  return (
    <nav aria-label="Palavva AI Engine" className="mb-4 flex gap-1 overflow-x-auto border-b" data-testid="engine-nav">
      {TABS.map((t) => {
        const on = t.exact ? path === t.href : path.startsWith(t.href);
        return (
          <Link key={t.href} href={t.href} aria-current={on ? "page" : undefined}
            className={cn("-mb-px inline-flex min-h-11 items-center gap-2 whitespace-nowrap border-b-2 px-3 text-sm font-medium",
              on ? "border-[var(--brand-tangerine)] text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>
            <t.icon className="size-4" aria-hidden="true" />{t.label}</Link>);
      })}
    </nav>
  );
}
