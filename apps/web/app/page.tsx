import { FeedView, cleanParams } from "@/components/FeedView";
import { getTenant } from "@/lib/tenant";

export const dynamic = "force-dynamic";

export default async function Home({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const tenant = await getTenant();
  return <FeedView tenant={tenant} mode="live" params={cleanParams(await searchParams)} base="/" />;
}
