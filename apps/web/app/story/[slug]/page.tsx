import { permanentRedirect } from "next/navigation";
import { PieceDetail, loadPiece, pieceMetadata } from "@/components/PieceDetail";
import { pieceHref } from "@/components/StoryCard";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  return pieceMetadata((await params).slug, "story");
}

export default async function Page({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ original?: string }> }) {
  const { tenant, piece } = await loadPiece((await params).slug, "story");
  const canonical = pieceHref(piece);
  if (!canonical.startsWith("/story/")) permanentRedirect(canonical);
  return <PieceDetail tenant={tenant} piece={piece} kind="story" showOriginal={(await searchParams).original === "1"} />;
}
