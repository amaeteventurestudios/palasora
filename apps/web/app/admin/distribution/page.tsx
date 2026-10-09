import Link from "next/link";
import { getTenant } from "@/lib/tenant";
import { pb, q } from "@/lib/pb";
import { H1, Metric, Table, Ago } from "@/components/admin/ui";
import { pieceHref } from "@/components/StoryCard";

export const metadata = { title: "Distribution & Search" };

export default async function Distribution() {
  const t = await getTenant();
  const pub = await pb.list("editorial_pieces", { filter: `tenant_id=${q(t.id)} && review_status='published'`, sort: "-published_at", perPage: 200 });
  const indexable = pub.filter((p) => !p.is_demo && !t.isDemo);
  const shares = await pb.list("aggregated_metrics", { filter: `tenant_id=${q(t.id)} && event='share_clicked'`, perPage: 500 });
  return (
    <div>
      <H1 sub="What crawlers and social previews see. Demo fixtures and demo tenants are noindex and excluded from the sitemap.">Distribution &amp; Search</H1>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Metric label="Sitemap URLs (stories)" value={indexable.length} period="Now" source="/sitemap.xml" hint={`${pub.length - indexable.length} published demo items excluded`} />
        <Metric label="Share intents (all time aggregated)" value={shares.reduce((a, r) => a + r.count, 0)} period="Aggregated days" source="share_clicked" />
        <Metric label="Search Console" value={null} period="n/a" source="Not linked" state="not_connected" />
      </div>
      <p className="mt-3 text-sm"><Link className="link" href="/sitemap.xml">sitemap.xml</Link> · <Link className="link" href="/robots.txt">robots.txt</Link></p>
      <div className="mt-4"><Table caption="Published URLs" head={["Headline", "Canonical", "Share image", "Indexed?", "Updated"]}>
        {pub.map((p) => <tr key={p.id}><td className="px-3 py-2">{p.headline}</td><td className="px-3 py-2"><Link className="link" href={pieceHref(p)}>{pieceHref(p)}</Link></td>
          <td className="px-3 py-2"><a className="link" href={`/og/${p.slug}?v=${p.revision}`}>1200×630</a></td><td className="px-3 py-2">{p.is_demo || t.isDemo ? "noindex (demo)" : "index"}</td><td className="px-3 py-2"><Ago v={p.material_updated_at || p.published_at} /></td></tr>)}
      </Table></div>
    </div>
  );
}
