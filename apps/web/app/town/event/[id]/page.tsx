// Palasora Phase 4: one town event and the live numbers of what it links to (Doc 06 section 13, "no second truth"). The
// feed post and any notification hold only this event's id and text; the figures below are read now from the economy.
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTenant } from "@/lib/tenant";
import { getSession } from "@/lib/session";
import { pb, q } from "@/lib/pb";
import { KIND_LABEL, townRecord, townTime } from "@/lib/town";

const sora = (n: number) => n.toFixed(2); // town prices are small (a meal is a few Sora), so two decimals

export const dynamic = "force-dynamic";
export const metadata = { title: "Town record", robots: { index: false } };

export default async function TownEvent({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tenant = await getTenant();
  const session = await getSession(tenant);
  const r = await townRecord(id, session?.user.id);
  if (!r) notFound();
  const [post, place] = await Promise.all([
    pb.first("editorial_pieces", `tenant_id=${q(tenant.id)} && town_event_id=${q(id)} && review_status='published'`),
    pb.first("communities", `tenant_id=${q(tenant.id)} && place_kind='town' && town_id=${q(r.town)}`),
  ]);
  const b = r.links.business, k = r.links.contract, v = r.links.vote;
  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6" data-testid="town-record">
      <p className="meta">{place ? <Link href={`/p/${place.slug}`} className="link">p/{place.slug}</Link> : "Town"} · {townTime(r.tick)} · {KIND_LABEL[r.kind] ?? r.kind}
        {r.visibility !== "public" && <> · <span data-testid="town-record-private">only you can see this</span></>}</p>
      <h1 className="mt-2 text-[26px] font-extrabold leading-tight tracking-tight">{r.text}</h1>
      {r.withdrawn && <p className="mt-2 rounded-lg border border-border bg-card-muted p-3 text-sm" role="note">This event was withdrawn: {r.withdrawn_reason}</p>}
      <section className="mt-5 rounded-xl border border-border p-4" aria-label="Live numbers">
        <h2 className="text-[15px] font-bold">Today&apos;s numbers</h2>
        <p className="meta">Read from the town&apos;s ledger as this page loaded. The post only says what happened.</p>
        {b && <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm" data-testid="town-record-business">
          <dt className="text-muted-foreground">Business</dt><dd>{b.type} {b.id} on plot {b.plot}</dd>
          <dt className="text-muted-foreground">Status</dt><dd>{b.status}{b.status === "open" ? ` · health ${b.health}` : ""}</dd>
          <dt className="text-muted-foreground">Level</dt><dd>{b.level}</dd>
          <dt className="text-muted-foreground">Price</dt><dd className="tabular-nums" data-testid="town-record-price">{sora(b.price_sora)} Sora</dd>
          <dt className="text-muted-foreground">Daily wage</dt><dd className="tabular-nums">{sora(b.wage_sora)} Sora</dd>
        </dl>}
        {k && <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
          <dt className="text-muted-foreground">Contract</dt><dd>{k.id}: {k.qty_per_day} {k.good} a day at {sora(k.price_sora)} Sora</dd>
          <dt className="text-muted-foreground">Status</dt><dd>{k.status} · {k.delivered} delivered · {k.breaches} breaches</dd>
        </dl>}
        {v && <p className="mt-3 text-sm">Week {v.week}: {v.winner || "no winner yet"}</p>}
        {!b && !k && !v && <p className="mt-3 text-sm text-muted-foreground">This event has no linked business, contract or vote.</p>}
      </section>
      <div className="mt-4 flex flex-wrap gap-3">
        {post && <Link href={`/posts/${post.slug}`} className="btn btn-secondary">Talk about it</Link>}
        <Link href="/notifications" className="btn btn-secondary">Notifications</Link>
      </div>
    </div>
  );
}
