// Palasora Phase 7: a business's full profile (Doc 06 section 10), opened from its card in the town. Same numbers as the
// card, read from the ledger as the page loads, plus recent events; the owner also gets the controls.
import Link from "next/link";
import { notFound } from "next/navigation";
import { loadBusinessCard } from "@/app/actions/town-business";
import { BusinessCard } from "@/components/world/BusinessCard";
import { BUSINESS_LABEL } from "@/lib/world/layout";

export const dynamic = "force-dynamic";
export const metadata = { title: "Business", robots: { index: false } };

export default async function BusinessProfile({ params }: { params: Promise<{ bid: string }> }) {
  const { bid } = await params;
  const card = await loadBusinessCard(bid);
  if (!card) notFound();
  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6" data-testid="biz-profile">
      <p className="meta"><Link href={`/?at=${card.plot}`} className="link">Back to the town</Link> · plot {card.plot}</p>
      <h1 className="mt-2 text-[26px] font-extrabold leading-tight tracking-tight">{card.owner_name ? `${card.owner_name}'s ${BUSINESS_LABEL[card.type].toLowerCase()}` : BUSINESS_LABEL[card.type]}</h1>
      <BusinessCard bid={card.id} initial={card} full />
    </div>
  );
}
