"use client";
// Global analytics filters (docs/specs/25 GlobalAnalyticsFilters): date window, country (54 + All Africa) and an optional
// segment. State lives in the URL so views are shareable and every server query uses the same scope.
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { CalendarRange, Globe2, Filter } from "lucide-react";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";

export function FilterBar({ range, country, countries, segment, segments }: { range: string; country: string; countries: { code: string; name: string; flag: string; region: string }[];
  segment?: string; segments?: { value: string; label: string }[] }) {
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  const set = (k: string, v: string) => { const u = new URLSearchParams(sp.toString()); u.set(k, v); router.push(`${path}?${u}`); };
  const regions = [...new Set(countries.map((c) => c.region))];
  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="admin-filters">
      <Select value={range} onValueChange={(v) => set("range", v)}>
        <SelectTrigger size="sm" className="w-[168px]" aria-label="Date range"><CalendarRange className="size-4" aria-hidden="true" /><SelectValue /></SelectTrigger>
        <SelectContent><SelectItem value="7d">Last 7 days</SelectItem><SelectItem value="30d">Last 30 days</SelectItem><SelectItem value="90d">Last 90 days</SelectItem></SelectContent>
      </Select>
      <Select value={country} onValueChange={(v) => set("country", v)}>
        <SelectTrigger size="sm" className="w-[190px]" aria-label="Country"><Globe2 className="size-4" aria-hidden="true" /><SelectValue /></SelectTrigger>
        <SelectContent className="max-h-[60vh]"><SelectItem value="ALL">🌍 All Africa</SelectItem>
          {regions.map((r) => <SelectGroup key={r}><SelectLabel>{r}</SelectLabel>{countries.filter((c) => c.region === r).map((c) => <SelectItem key={c.code} value={c.code}>{c.flag} {c.name}</SelectItem>)}</SelectGroup>)}
        </SelectContent>
      </Select>
      {segments && segments.length > 1 && (
        <Select value={segment} onValueChange={(v) => set("segment", v)}>
          <SelectTrigger size="sm" className="w-[180px]" aria-label="Segment"><Filter className="size-4" aria-hidden="true" /><SelectValue /></SelectTrigger>
          <SelectContent>{segments.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
        </Select>
      )}
    </div>
  );
}
