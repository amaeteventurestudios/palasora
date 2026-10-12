// ISSUE-20 Distribution & search: what crawlers, AI tools and social previews are offered, and what is actually known.
// "index" is only the directive Palavva requests; whether Google or Bing indexed a page is unknown until their webmaster
// tools are connected (they are not).
import Link from "next/link";
import { getTenant } from "@/lib/tenant";
import { pb, q } from "@/lib/pb";
import { listAll } from "@/lib/admin/fetchall";
import { pieceHref } from "@/components/StoryCard";
import { launched } from "@/lib/seo/llms";
import { AdminPage } from "@/components/admin/AdminPage";
import { HelpTip } from "@/components/admin/HelpTip";
import { MetricCard } from "@/components/admin/charts/Panels";
import { UrlTable, type UrlRow } from "@/components/admin/distribution/UrlTable";

export const metadata = { title: "Distribution & search" };
export const dynamic = "force-dynamic";

export default async function Distribution() {
  const t = await getTenant();
  const live = launched(t);
  const [pub, shares] = await Promise.all([
    listAll("editorial_pieces", `tenant_id=${q(t.id)} && review_status='published'`, "id,headline,slug,kind,country_codes,language,is_demo,revision,material_updated_at,published_at", 20000, "-published_at"),
    pb.list("aggregated_metrics", { filter: `tenant_id=${q(t.id)} && event='share_clicked'`, perPage: 500 }),
  ]);
  const indexable = pub.filter((p) => !p.is_demo && !t.isDemo);
  const directive = (demo: boolean) => (demo || t.isDemo ? "noindex (demo)" : live ? "index requested" : "noindex (not launched)");
  const rows: UrlRow[] = pub.slice(0, 5000).map((p) => ({ id: p.id, headline: p.headline, href: pieceHref(p), kind: p.kind, country: (p.country_codes ?? []).join(", "), lang: p.language || "en",
    directive: directive(!!p.is_demo), md: p.kind !== "source_link" && !p.is_demo, updated: String(p.material_updated_at || p.published_at), og: `/og/${p.slug}?v=${p.revision}` }));
  return (
    <AdminPage title="Distribution & search" narrative={`${indexable.length.toLocaleString("en")} published pages are in the sitemap. ${live ? "Crawling is allowed for public pages." : "This deployment is not publicly launched, so robots.txt blocks all crawling and pages carry noindex."} Whether any search engine has indexed a page is unknown: Google Search Console and Bing Webmaster Tools are not connected.`}
      actions={<HelpTip label="Index requested vs indexed" what="'Index requested' means Palavva tells search engines they may list a page. It does not mean they have. Only Google Search Console or Bing Webmaster Tools can confirm indexing."
        why="Treating the request as a result would overstate how discoverable Palavva is."
        todo="Before launch nothing is crawlable. After launch, connect Search Console with the site owner's account to see real coverage." />}>
      <section className="kpi-grid" aria-label="Discovery">
        <MetricCard label="Sitemap pages" value={indexable.length.toLocaleString("en")} definition="Published, non-demo pages listed in /sitemap.xml, plus the main static pages." source="/sitemap.xml" />
        <MetricCard label="Crawling" value={live ? "Allowed (public pages)" : "Blocked (not launched)"} definition="What robots.txt says right now. Admin, account, API and search pages are always excluded." source="/robots.txt" />
        <MetricCard label="Confirmed indexed" value="Unknown" definition="Needs Google Search Console or Bing Webmaster Tools, which are not connected." source="not connected" />
        <MetricCard label="AI guide (llms.txt)" value="Published" definition="A short, curated guide for AI tools at /llms.txt, with a longer version at /llms-full.txt. An emerging convention, not a ranking factor." source="/llms.txt" />
        <MetricCard label="Markdown pages" value={rows.filter((r) => r.md).length.toLocaleString("en")} definition="Palavva-original posts and discussions available as Markdown at /md/{slug}. Publisher headlines are never republished." source="/md" />
        <MetricCard label="Share intents" value={shares.reduce((a, r) => a + r.count, 0).toLocaleString("en")} definition="Share button actions by people (aggregated). Not proof the share was posted, and not referred visits." source="share_clicked" />
      </section>
      <p className="text-sm" data-testid="discovery-links"><Link className="link" href="/sitemap.xml">sitemap.xml</Link> · <Link className="link" href="/robots.txt">robots.txt</Link> · <Link className="link" href="/llms.txt">llms.txt</Link> · <Link className="link" href="/llms-full.txt">llms-full.txt</Link></p>
      <UrlTable rows={rows} />
    </AdminPage>
  );
}
