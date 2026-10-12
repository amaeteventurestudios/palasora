"use client";
// Phase 8 / ISSUE-06: the "About this page" "?" in the Command Center header (follows client-side navigation).
import { usePathname } from "next/navigation";
import { helpFor } from "@/lib/admin/page-help";
import { HelpTip } from "./HelpTip";

export function PageHelp() {
  const h = helpFor(usePathname());
  if (!h) return null;
  return <span className="inline-flex items-center gap-1 text-sm text-muted-foreground" data-testid="page-help"><span className="hidden sm:inline">About this page</span><HelpTip label={h.title} what={h.what} why={h.why} todo={h.todo} /></span>;
}
