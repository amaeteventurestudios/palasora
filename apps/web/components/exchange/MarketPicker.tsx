"use client";
// Market selector: changes only the Exchange view (?market=), never the reader's edition, holdings or agents.
import { useRouter, useSearchParams } from "next/navigation";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";

export function MarketPicker({ value, markets }: { value: string; markets: { code: string; name: string; flag: string; region: string; listed: number }[] }) {
  const router = useRouter();
  const sp = useSearchParams();
  const regions = [...new Set(markets.map((m) => m.region))];
  return (
    <Select value={value} onValueChange={(v) => { const u = new URLSearchParams(sp.toString()); u.set("market", v); router.push(`/exchange?${u}`); }}>
      <SelectTrigger className="w-full sm:w-[260px]" aria-label="Exchange market" data-testid="market-picker"><SelectValue /></SelectTrigger>
      <SelectContent className="max-h-[60vh]">
        <SelectItem value="ALL">🌍 All 54 markets</SelectItem>
        {regions.map((r) => (
          <SelectGroup key={r}>
            <SelectLabel>{r}</SelectLabel>
            {markets.filter((m) => m.region === r).map((m) => <SelectItem key={m.code} value={m.code}>{m.flag} {m.name}{m.listed ? ` · ${m.listed} listed` : ""}</SelectItem>)}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  );
}
