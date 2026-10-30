"use client";
// A link that knows the social network lives at its own address: on Palasora (or any game's host) a link to a feed page is a
// plain link to Jisste, so there is no prefetch to another origin and no hop through a redirect. Everything else is a normal Link.
import { createContext, useContext, type ComponentProps } from "react";
import Link from "next/link";
import { SOCIAL_PATH } from "@/lib/social-paths";

// base: the network's address, set on Palasora (and empty on the network itself). town: Palasora's address, set on the network,
// so its "Town" link goes straight back to the town.
const NetBase = createContext({ base: "", town: "" });
export function NetBaseProvider({ base, town = "", children }: { base: string; town?: string; children: React.ReactNode }) {
  return <NetBase.Provider value={{ base, town }}>{children}</NetBase.Provider>;
}
export function useNetHref(href: string): string | null {
  const { base, town } = useContext(NetBase);
  if (town && href === "/town") return town + "/";
  return base && SOCIAL_PATH.test(href) ? base + href : null;
}
export function NetLink({ href, prefetch, ...rest }: ComponentProps<typeof Link> & { href: string }) {
  const out = useNetHref(href);
  if (out) { const { replace: _r, scroll: _s, shallow: _sh, passHref: _p, legacyBehavior: _l, locale: _lo, onNavigate: _n, ...a } = rest as Record<string, unknown>; return <a href={out} {...(a as ComponentProps<"a">)} />; }
  return <Link href={href} prefetch={prefetch} {...rest} />;
}
