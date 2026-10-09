import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FeedView, cleanParams } from "@/components/FeedView";
import { FEED_MODES, MODE_LABELS, type FeedMode } from "@/lib/feed";
import { getTenant } from "@/lib/tenant";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ mode: string }> }): Promise<Metadata> {
  const { mode } = await params;
  return { title: FEED_MODES.includes(mode as FeedMode) ? `${MODE_LABELS[mode as FeedMode]} conversations` : "Feed" };
}

export default async function FeedPage({ params, searchParams }: { params: Promise<{ mode: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { mode } = await params;
  if (!FEED_MODES.includes(mode as FeedMode)) notFound();
  const tenant = await getTenant();
  return <FeedView tenant={tenant} mode={mode as FeedMode} params={cleanParams(await searchParams)} base={`/feed/${mode}`} showHero={false} />;
}
