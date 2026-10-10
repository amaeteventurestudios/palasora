import Link from "next/link";
import { getTenant } from "@/lib/tenant";
import { taxonomy } from "@/lib/repo/taxonomy";

export const metadata = { title: "Topics" };
export const dynamic = "force-dynamic";

export default async function Topics() {
  await getTenant();
  const { groups, topics } = await taxonomy();
  return (
    <div className="container-pv py-8">
      <h1 className="text-3xl font-extrabold">Topics</h1>
      <p className="mt-1 text-muted-foreground">Browse by subject, then combine with any country.</p>
      <div className="mt-6 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {groups.map((g) => (
          <section key={g.slug} id={g.slug} className="card scroll-mt-20 p-5" aria-labelledby={`g-${g.slug}`}>
            <h2 id={`g-${g.slug}`} className="text-lg font-bold">{g.name}</h2>
            <p className="text-sm text-muted-foreground">{g.description}</p>
            <ul className="mt-3 flex flex-col gap-1">{topics.filter((t) => t.group_slug === g.slug).map((t) => <li key={t.slug}><Link className="font-medium hover:underline" href={`/topic/${t.slug}`}>{t.name}</Link></li>)}</ul>
          </section>
        ))}
      </div>
    </div>
  );
}
