// /town/[slug]: the world viewer opened on a town, optionally at a plot (`?at=P405`), so a shared link lands on the same place.
import { notFound } from "next/navigation";
import { WorldPage, worldMetadata } from "@/components/world/WorldPage";

export const dynamic = "force-dynamic";
export const generateMetadata = worldMetadata;

export default async function TownPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { slug } = await params;
  if (!/^[a-z0-9-]{1,60}$/.test(slug)) notFound();
  const sp = await searchParams;
  return <WorldPage slug={slug} at={typeof sp.at === "string" ? sp.at : undefined} />;
}
