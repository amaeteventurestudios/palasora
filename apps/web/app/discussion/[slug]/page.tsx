import { permanentRedirect } from "next/navigation";
import { PieceDetail, loadPiece, pieceMetadata } from "@/components/PieceDetail";
import { pieceHref } from "@/components/StoryCard";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  return pieceMetadata((await params).slug, "discussion");
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { tenant, piece } = await loadPiece((await params).slug, "discussion");
  const canonical = pieceHref(piece);
  if (!canonical.startsWith("/discussion/")) permanentRedirect(canonical);
  return <PieceDetail tenant={tenant} piece={piece} kind="discussion" />;
}
