import Link from "next/link";
import { getTenant } from "@/lib/tenant";
import { taxonomy } from "@/lib/repo/taxonomy";

export const metadata = { title: "Countries" };
export const dynamic = "force-dynamic";

export default async function Countries() {
  await getTenant();
  const { countries } = await taxonomy();
  const regions = [...new Set(countries.map((c) => c.region))].sort();
  return (
    <div className="container-pv py-8">
      <h1 className="text-3xl font-extrabold">Across Africa</h1>
      <p className="mt-1 text-muted">Choose a country or follow the stories crossing borders.</p>
      <div className="mt-6 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {regions.map((r) => (
          <section key={r} className="card p-5" aria-labelledby={`r-${r}`}>
            <h2 id={`r-${r}`} className="text-lg font-bold">{r}</h2>
            <ul className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1">
              {countries.filter((c) => c.region === r).map((c) => <li key={c.iso2}><Link className="hover:underline" href={`/country/${c.slug}`}>{c.name}</Link></li>)}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
