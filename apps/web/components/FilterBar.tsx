import Link from "next/link";
import type { Country, Topic } from "@/lib/repo/taxonomy";

const FEATURED_TOPICS = ["fintech", "telecom", "food", "music", "agriculture", "ai-software", "energy", "fashion", "logistics", "policy"];

function href(base: string, p: Record<string, string | undefined>) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(p)) if (v) sp.set(k, v);
  const qs = sp.toString();
  return qs ? `${base}?${qs}` : base;
}

/** Country + topic chip rows. Each chip is a real link; selections combine through the URL. */
export function FilterBar({ base, countries, allCountries, topics, country, topic, lang }: {
  base: string; countries: Country[]; allCountries: Country[]; topics: Topic[]; country?: string; topic?: string; lang?: string;
}) {
  const featured = FEATURED_TOPICS.map((s) => topics.find((t) => t.slug === s)).filter(Boolean) as Topic[];
  const selectedTopic = topic && !featured.some((t) => t.slug === topic) ? topics.find((t) => t.slug === topic) : undefined;
  const selectedCountry = country && !countries.some((c) => c.iso2 === country) ? allCountries.find((c) => c.iso2 === country) : undefined;
  return (
    <div className="flex flex-col gap-2">
      <div role="group" aria-label="Filter by country" className="scroll-row">
        <Link href={href(base, { topic, lang })} className="chip" aria-current={!country ? "true" : undefined}>All Africa</Link>
        {selectedCountry && <Link href={href(base, { country: selectedCountry.iso2, topic, lang })} className="chip" aria-current="true">{selectedCountry.name}</Link>}
        {countries.map((c) => (
          <Link key={c.iso2} href={href(base, { country: c.iso2, topic, lang })} className="chip" aria-current={country === c.iso2 ? "true" : undefined}>{c.name}</Link>
        ))}
        <Link href="/countries" className="chip">More countries</Link>
      </div>
      <div role="group" aria-label="Filter by topic" className="scroll-row">
        <Link href={href(base, { country, lang })} className="chip" aria-current={!topic ? "true" : undefined}>All topics</Link>
        {selectedTopic && <Link href={href(base, { country, topic: selectedTopic.slug, lang })} className="chip" aria-current="true">{selectedTopic.name}</Link>}
        {featured.map((t) => (
          <Link key={t.slug} href={href(base, { country, topic: t.slug, lang })} className="chip" aria-current={topic === t.slug ? "true" : undefined}>{t.name}</Link>
        ))}
        <Link href="/topics" className="chip">All topics list</Link>
      </div>
    </div>
  );
}
