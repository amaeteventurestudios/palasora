"use client";
// Persistent mobile bottom navigation: EXACTLY Home | SubPals | Activity | Exchange | My Agent (unified master §1).
// 44 px+ targets, safe-area inset, aria-current; hidden from md upward where the rails and header take over.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BOTTOM_NAV } from "./nav";
import { iconFor } from "./icons";

function isActive(path: string, href: string) {
  if (href === "/") return path === "/";
  if (href === "/subpals") return path.startsWith("/subpals") || path.startsWith("/p/");
  if (href === "/live") return path.startsWith("/live") || path.startsWith("/notifications");
  if (href === "/my-agents") return path.startsWith("/my-agents") || path.startsWith("/agents/new") || path.startsWith("/wallet") || path.startsWith("/portfolio");
  return path.startsWith(href);
}

export function BottomNav() {
  const path = usePathname();
  if (path.startsWith("/admin")) return null; // operator console has its own navigation
  return (
    <nav aria-label="Primary" data-testid="bottom-nav"
      className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur supports-[backdrop-filter]:bg-background/85 md:hidden">
      <ul className="mx-auto grid max-w-lg grid-cols-5">
        {BOTTOM_NAV.map((n) => {
          const Icon = iconFor(n.icon);
          const on = isActive(path, n.href);
          return (
            <li key={n.href}>
              <Link href={n.href} aria-current={on ? "page" : undefined} data-testid={`bottom-nav-${n.label.toLowerCase().replace(/\s+/g, "-")}`}
                className="flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium text-muted-foreground aria-[current=page]:text-primary">
                <Icon className="size-[22px]" strokeWidth={on ? 2.4 : 1.9} aria-hidden="true" />{n.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
