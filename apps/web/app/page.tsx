// Palasora Phase 6: the app opens into the town (Doc 06 sections 8 and 9, Doc 03 section 6). White-label tenants keep the
// social feed as their landing screen. The social network moved to /feed.
import { getTenant } from "@/lib/tenant";
import { WorldPage, worldMetadata } from "@/components/world/WorldPage";
import Feed from "./feed/page";
import { onNetworkHost, networkMetadata } from "@/lib/network";

export const dynamic = "force-dynamic";
// On the network's own address (Noveyah, lib/network.ts) the feed is home and the town is not shown.
export const generateMetadata = async () => ((await onNetworkHost()) ? { title: { absolute: networkMetadata.title.default }, description: networkMetadata.description } : worldMetadata());

export default async function Home(props: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const tenant = await getTenant();
  if (tenant.slug !== "palavva" || (await onNetworkHost())) return <Feed {...props} />;
  const sp = await props.searchParams;
  return <WorldPage at={typeof sp.at === "string" ? sp.at : undefined} resident={typeof sp.resident === "string" ? sp.resident : undefined} />;
}
