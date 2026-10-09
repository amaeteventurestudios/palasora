import Link from "next/link";
import { getTenant } from "@/lib/tenant";
import { fallbackSearch, publicFilter, toSummary, type PieceSummary } from "@/lib/repo/pieces";
import { taxonomy } from "@/lib/repo/taxonomy";
import { editorialFetch } from "@/lib/editorial-client";
import { pb, q } from "@/lib/pb";
import { StoryCard } from "@/components/StoryCard";

export const metadata = { title: "Search", robots: { index: false } };
export const dynamic = "force-dynamic";

type SP = { q?: string; country?: string; topic?: string; lang?: string };

async function search(tenantId: string, term: string, country?: string, topic?: string): Promise<{ ids: string[]; engine: string } | null> {
  const p = new URLSearchParams({ tenant_id: tenantId, q: term });
  if (country) p.set("country", country);
  if (topic) p.set("topic", topic);
  const r = await editorialFetch<{ ids: string[] }>(`/search?${p}`);
  return r ? { ids: r.ids, engine: "fts" } : null;
}

export default async function SearchPage({ searchParams }: { searchParams: Promise<SP> }) {
  const tenant = await getTenant();
  const sp = await searchParams;
  const term = (sp.q ?? "").slice(0, 120).trim();
  const country = sp.country && /^[A-Z]{2}$/.test(sp.country) ? sp.country : undefined;
  const topic = sp.topic && /^[a-z0-9-]{1,60}$/.test(sp.topic) ? sp.topic : undefined;
  const tax = await taxonomy();
  const names = { countries: Object.fromEntries(tax.countries.map((c) => [c.iso2, c.name])), topics: Object.fromEntries(tax.topics.map((t) => [t.slug, t.name])) };
  let results: PieceSummary[] = [];
  let engine = "";
  if (term) {
    const fts = await search(tenant.id, term, country, topic);
    if (fts) {
      engine = "fts";
      if (fts.ids.length) {
        // Re-check every hit against the public filter: the index can never leak drafts or other tenants.
        const rows = await pb.list("editorial_pieces", { filter: `${publicFilter(tenant)} && (${fts.ids.slice(0, 20).map((i) => `id=${q(i)}`).join(" || ")})`, perPage: 20 });
        const order = new Map(fts.ids.map((id, i) => [id, i]));
        results = rows.map(toSummary).sort((a, b) => (order.get(a.id)! - order.get(b.id)!));
      }
    } else { engine = "fallback"; results = await fallbackSearch(tenant, term, country, topic); }
  }
  return (
    <div className="container-pv max-w-4xl py-8">
      <h1 className="text-3xl font-extrabold">Search</h1>
      <form action="/search" method="get" role="search" className="mt-4 flex flex-col gap-3">
        <div className="flex gap-2">
          <label htmlFor="q" className="sr-only">Search</label>
          <input id="q" name="q" type="search" defaultValue={term} maxLength={120} placeholder="Search news, history, businesses, and ideas" className="input" />
          <button className="btn btn-primary">Search</button>
        </div>
        <div className="flex flex-wrap gap-3">
          <div><label htmlFor="country" className="field-label">Country</label>
            <select id="country" name="country" defaultValue={country ?? ""} className="input"><option value="">All Africa</option>{tax.countries.map((c) => <option key={c.iso2} value={c.iso2}>{c.name}</option>)}</select></div>
          <div><label htmlFor="topic" className="field-label">Topic</label>
            <select id="topic" name="topic" defaultValue={topic ?? ""} className="input"><option value="">All topics</option>{tax.topics.map((t) => <option key={t.slug} value={t.slug}>{t.name}</option>)}</select></div>
          <div><label htmlFor="lang" className="field-label">Language</label>
            <select id="lang" name="lang" defaultValue="en" className="input"><option value="en">English</option></select></div>
        </div>
        {(term || country || topic) && <Link href="/search" className="text-sm link self-start">Clear search and filters</Link>}
      </form>
      <section aria-live="polite" className="mt-6">
        {term && results.length === 0 && <p>Nothing matched those filters. Try a broader search, another country, or a different topic.</p>}
        {results.length > 0 && <p className="meta mb-3">{results.length} result{results.length === 1 ? "" : "s"}{engine === "fallback" ? " (basic search: the search index is unavailable)" : ""}</p>}
        <ol className="flex flex-col gap-3">{results.map((p) => <li key={p.id}><StoryCard p={p} names={names} headingLevel={2} /></li>)}</ol>
      </section>
    </div>
  );
}
