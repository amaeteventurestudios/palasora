"use client";
// ISSUE-19 public business directory. Order comes from rankDirectory (verified first; payment never lifts an unverified business).
import Link from "next/link";
import { DataTable, type Column } from "@/components/admin/DataTable";

export type PublicBiz = { id: string; slug: string; name: string; country: string; countryName: string; sector: string; verified: boolean; isDemo: boolean; editorial: boolean; about: string; rank: number };
export function BusinessDirectory({ rows }: { rows: PublicBiz[] }) {
  const cols: Column<PublicBiz>[] = [
    { key: "rank", header: "#", cell: (r) => <span className="text-xs text-muted-foreground">{r.rank}</span>, sort: (r) => r.rank },
    { key: "name", header: "Business", cell: (r) => <span><Link className="link font-semibold" href={`/business/${r.slug}`}>{r.name}</Link>
      <span className="ms-2 inline-flex flex-wrap gap-1 align-middle">{r.verified && <span className="label-pill label-human" data-label="verified">Verified by Palavva staff</span>}
        {r.isDemo && <span className="label-pill" data-label="demo">Demo example, not a real business</span>}{r.editorial && <span className="label-pill" data-label="editorial">Editorial spotlight</span>}
        {!r.verified && !r.isDemo && <span className="label-pill" data-label="unverified">Not yet verified</span>}</span>
      {r.about && <span className="mt-0.5 block max-w-[70ch] text-xs text-muted-foreground">{r.about.slice(0, 160)}{r.about.length > 160 ? "…" : ""}</span>}</span>, sort: (r) => r.name },
    { key: "country", header: "Country", cell: (r) => r.countryName || "—", sort: (r) => r.countryName },
    { key: "sector", header: "Sector", cell: (r) => r.sector || "—", sort: (r) => r.sector },
  ];
  const countries = [...new Map(rows.map((r) => [r.country, r.countryName])).entries()].filter(([c]) => c);
  const sectors = [...new Set(rows.map((r) => r.sector).filter(Boolean))];
  return <DataTable caption="Business directory" testid="biz-directory" rows={rows} columns={cols} rowKey={(r) => r.id} initialSort={{ key: "rank", dir: "asc" }}
    search={(r) => `${r.name} ${r.countryName} ${r.sector} ${r.about}`}
    filters={[{ key: "v", label: "Status", options: [{ value: "verified", label: "Verified" }, { value: "unverified", label: "Not yet verified" }, { value: "demo", label: "Demo" }], get: (r) => (r.isDemo ? "demo" : r.verified ? "verified" : "unverified") },
      ...(countries.length > 1 && countries.length <= 15 ? [{ key: "country", label: "Country", options: countries.map(([value, label]) => ({ value, label })), get: (r: PublicBiz) => r.country }] : []),
      ...(sectors.length > 1 && sectors.length <= 12 ? [{ key: "sector", label: "Sector", options: sectors.map((v) => ({ value: v, label: v })), get: (r: PublicBiz) => r.sector }] : [])]}
    empty="No businesses listed yet." />;
}
