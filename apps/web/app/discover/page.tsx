import Link from "next/link";
import { getTenant } from "@/lib/tenant";
import { listFeed } from "@/lib/repo/pieces";
import { priorityCountries, taxonomy } from "@/lib/repo/taxonomy";
import { StoryCard } from "@/components/StoryCard";
import { pb, q } from "@/lib/pb";

export const metadata = { title: "Discover" };
export const dynamic = "force-dynamic";

export default async function Discover() {
  const tenant = await getTenant();
  const [tax, prio, picks, founders] = await Promise.all([taxonomy(), priorityCountries(), listFeed(tenant, { mode: "discover", limit: 6 }),
    pb.list("businesses", { filter: `tenant_id=${q(tenant.id)} && profile_status='published'`, perPage: 4, sort: "-created" })]);
  const names = { countries: Object.fromEntries(tax.countries.map((c) => [c.iso2, c.name])), topics: Object.fromEntries(tax.topics.map((t) => [t.slug, t.name])) };
  return (
    <div className="container-pv py-8">
      <h1 className="text-3xl font-extrabold">There&apos;s more to the story.</h1>
      <p className="mt-1 text-muted">Find conversations by country, topic, or the question you&apos;ve been thinking about.</p>
      <form action="/search" method="get" role="search" className="mt-4 flex max-w-2xl gap-2">
        <label htmlFor="dq" className="sr-only">Search</label>
        <input id="dq" name="q" type="search" maxLength={120} placeholder="Search news, history, businesses, and ideas" className="input" />
        <button className="btn btn-primary">Search</button>
      </form>
      <section className="mt-8" aria-labelledby="h-closer"><h2 id="h-closer" className="text-xl font-bold">Worth a closer look</h2>
        {picks.items.length === 0 ? <p className="mt-2 text-muted">No editor&apos;s picks yet.</p> :
          <ul className="mt-3 grid gap-3 md:grid-cols-2">{picks.items.map((p) => <li key={p.id}><StoryCard p={p} names={names} /><span className="meta">Editor&apos;s pick</span></li>)}</ul>}
      </section>
      <section className="mt-8" aria-labelledby="h-c"><h2 id="h-c" className="text-xl font-bold">Countries</h2>
        <div className="scroll-row mt-3 flex-wrap">{prio.map((c) => <Link key={c.iso2} className="chip" href={`/country/${c.slug}`}>{c.name}</Link>)}<Link className="chip" href="/countries">All 54 countries</Link></div></section>
      <section className="mt-8" aria-labelledby="h-t"><h2 id="h-t" className="text-xl font-bold">Topics</h2>
        <div className="mt-3 flex flex-wrap gap-2">{tax.topics.map((t) => <Link key={t.slug} className="chip" href={`/topic/${t.slug}`}>{t.name}</Link>)}</div></section>
      <section className="mt-8" aria-labelledby="h-a"><h2 id="h-a" className="text-xl font-bold">From the archives</h2>
        <p className="mt-2 text-muted">No verified archival material has been published yet. <Link href="/take-me-back" className="link">Take me back</Link></p></section>
      <section className="mt-8" aria-labelledby="h-f"><h2 id="h-f" className="text-xl font-bold">People building things</h2>
        {founders.length === 0 ? <p className="mt-2 text-muted">No spotlights yet.</p> :
          <ul className="mt-2">{founders.map((b) => <li key={b.id}><Link className="link" href={`/business/${b.slug}`}>{b.name}</Link>{b.is_demo ? " (demo content)" : ""}</li>)}</ul>}
      </section>
    </div>
  );
}
