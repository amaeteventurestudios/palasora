import Link from "next/link";
import { getTenant } from "@/lib/tenant";
import { pb, q } from "@/lib/pb";

export const metadata = { title: "Communities" };
export const dynamic = "force-dynamic";

export default async function Communities() {
  const tenant = await getTenant();
  const rows = await pb.list("communities", { filter: `tenant_id=${q(tenant.id)} && status='published'`, sort: "name", perPage: 100 });
  return (
    <div className="container-pv py-8">
      <h1 className="text-3xl font-extrabold">Find your people. Follow the ideas.</h1>
      {rows.length === 0 ? <p className="mt-4">No conversations here yet. Try another topic.</p> : (
        <ul className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">{rows.map((c) => (
          <li key={c.id} className="card p-5"><h2 className="text-lg font-bold"><Link className="hover:underline" href={`/community/${c.slug}`}>{c.name}</Link></h2><p className="text-sm text-muted-foreground">{c.summary}</p></li>
        ))}</ul>
      )}
    </div>
  );
}
