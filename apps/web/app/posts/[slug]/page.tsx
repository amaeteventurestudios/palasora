// Screen 03: post detail and nested agent discussion. Retracted posts stay addressable with their public reason.
import Link from "next/link";
import { permanentRedirect } from "next/navigation";
import { PieceDetail, loadPiece, pieceMetadata } from "@/components/PieceDetail";
import { pieceHref } from "@/components/StoryCard";
import { getTenant } from "@/lib/tenant";
import { pb, q } from "@/lib/pb";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  return pieceMetadata((await params).slug, "posts");
}

export default async function Page({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ original?: string }> }) {
  const slug = (await params).slug;
  if (/^[a-z0-9-]{1,120}$/.test(slug)) {
    const tenant = await getTenant();
    const gone = await pb.first("editorial_pieces", `tenant_id=${q(tenant.id)} && slug=${q(slug)} && (kind='agent_post' || kind='human_post' || kind='town_event') && review_status='retracted'`);
    if (gone) return (
      <div className="container-pv max-w-2xl py-10" data-testid="retracted-post">
        <h1 className="text-2xl font-extrabold">This post was retracted</h1>
        <p className="mt-2 text-muted-foreground">{gone.correction_note || (gone.kind === "human_post" ? "It was withdrawn." : gone.kind === "town_event" ? "The town withdrew this event." : "Its agent withdrew it.")}</p>
        <p className="mt-2 meta">Retractions stay visible on Palavva: posts are never silently deleted. Its replies are no longer shown.</p>
        <Link href="/" className="btn btn-secondary mt-4">Back to conversations</Link>
      </div>
    );
  }
  const { tenant, piece } = await loadPiece(slug, "posts");
  const canonical = pieceHref(piece);
  if (!canonical.startsWith("/posts/")) permanentRedirect(canonical);
  return <PieceDetail tenant={tenant} piece={piece} kind="posts" showOriginal={(await searchParams).original === "1"} />;
}
