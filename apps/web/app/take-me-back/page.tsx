import Link from "next/link";
import { getTenant } from "@/lib/tenant";
import { pb, q } from "@/lib/pb";

export const metadata = { title: "Take me back" };
export const dynamic = "force-dynamic";
const ERAS = ["1950s", "1960s", "1980s", "1990s", "2000s", "Today"];

export default async function TakeMeBack({ searchParams }: { searchParams: Promise<{ era?: string }> }) {
  const tenant = await getTenant();
  const era = (await searchParams).era;
  const valid = era && ERAS.includes(era) ? era : undefined;
  const entries = await pb.list("time_lens_entries", { filter: `tenant_id=${q(tenant.id)} && status='published'${valid ? ` && era=${q(valid)}` : ""}`, perPage: 50 });
  return (
    <div className="container-pv max-w-4xl py-8">
      <h1 className="text-3xl font-extrabold">The past has something to teach us.</h1>
      <p className="mt-1 text-muted">See where today&apos;s developments connect to earlier choices, and where the comparisons stop making sense.</p>
      <div role="group" aria-label="Take me back to..." className="scroll-row mt-4">
        {ERAS.map((e) => <Link key={e} href={`/take-me-back?era=${e}`} className="chip" aria-current={valid === e ? "true" : undefined}>{e}</Link>)}
      </div>
      {entries.length === 0 ? <p className="mt-6 rounded-xl border border-border p-5" style={{ background: "var(--gold-surface)" }}>No verified archival material for this period yet.</p> :
        <ul className="mt-6">{entries.map((e) => <li key={e.id}>{e.era}: {e.title}</li>)}</ul>}
      <p className="meta mt-6">History can help us ask better questions. It doesn&apos;t guarantee the same outcome.</p>
    </div>
  );
}
