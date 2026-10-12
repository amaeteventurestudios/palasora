// Workspace header: title, one-sentence narrative ("what is happening, what changed"), scope filters, freshness.
// ISSUE-04: full available width on every Command Center route (Event Pipeline is the reference): no centred max-width
// wrapper. Prose keeps a readable measure (80ch); card rows use the adaptive `kpi-grid` (globals.css).
import { Suspense } from "react";
import { FilterBar } from "./FilterBar";
import { countryCodes, countryName, flag, regionOf } from "@/lib/edition";
import type { Scope } from "@/lib/admin/scope";

const COUNTRIES = countryCodes().map((code) => ({ code, name: countryName(code), flag: flag(code), region: regionOf(code) }));

export function AdminPage({ title, narrative, scope, segments, children, actions }: { title: string; narrative: React.ReactNode; scope?: Scope;
  segments?: { value: string; label: string }[]; children: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="flex w-full min-w-0 flex-col gap-4" data-testid="admin-page">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <h1 className="text-[24px] font-extrabold tracking-tight sm:text-[28px]">{title}</h1>
          <p className="mt-0.5 max-w-[80ch] text-sm text-muted-foreground" data-testid="narrative">{narrative}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {scope && <Suspense><FilterBar range={scope.range} country={scope.country} countries={COUNTRIES} segment={scope.segment} segments={segments} /></Suspense>}
          {actions}
        </div>
      </div>
      {scope && <p className="text-xs text-muted-foreground">Scope: {scope.dayList[0]} to {scope.dayList.at(-1)} (UTC, {scope.days} days) · {scope.country === "ALL" ? "All Africa" : `${flag(scope.country)} ${countryName(scope.country)}`} · computed {new Date().toISOString().slice(11, 16)} UTC from live records</p>}
      {children}
    </div>
  );
}
