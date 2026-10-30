// Privacy, Terms and Support: every Noveniqe game shows the three on its front page, and each points at that site's own
// pages and support inbox. The same pages serve Palasora and Jisst (lib/network.ts); only the name changes with the host.
import { onNetworkHost, NETWORK_TITLE } from "./network";
export { SUPPORT_EMAIL } from "./support";
export const LEGAL_UPDATED = "28 October 2026";

/** The name visitors know this site by on this request: Palasora, or the network's name on its own address. */
export async function siteName(): Promise<string> {
  return (await onNetworkHost()) ? NETWORK_TITLE : "Palasora";
}
