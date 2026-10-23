// Palasora Phase 6: the app opens into the town (Doc 06 sections 8 and 9, Doc 03 section 6). White-label tenants keep the
// social feed as their landing screen. The social network moved to /feed.
import { getTenant } from "@/lib/tenant";
import { WorldPage, worldMetadata } from "@/components/world/WorldPage";
import Feed from "./feed/page";

export const dynamic = "force-dynamic";
export const generateMetadata = worldMetadata;

export default async function Home(props: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const tenant = await getTenant();
  if (tenant.slug !== "palavva") return <Feed {...props} />;
  const sp = await props.searchParams;
  return <WorldPage at={typeof sp.at === "string" ? sp.at : undefined} resident={typeof sp.resident === "string" ? sp.resident : undefined} />;
}
