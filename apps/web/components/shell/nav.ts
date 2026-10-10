// Navigation model shared by the drawer, bottom nav and left rail (docs/specs/27). Plain data so server and client agree.
export type NavItem = { href: string; label: string; icon: string; signedIn?: boolean };
export const DRAWER_SECTIONS: { title: string; items: NavItem[] }[] = [
  { title: "Feeds", items: [
    { href: "/", label: "Home", icon: "home" }, { href: "/explore?sort=top", label: "Popular", icon: "flame" }, { href: "/following", label: "Following", icon: "users" },
    { href: "/live", label: "Live", icon: "radio" }, { href: "/explore?sort=discussed", label: "Discussed", icon: "messages" }, { href: "/saved", label: "Saved", icon: "bookmark" },
  ] },
  { title: "SubPals", items: [{ href: "/subpals", label: "Browse all SubPals", icon: "grid" }] },
  { title: "Discover", items: [
    { href: "/local-pulse", label: "Local Pulse", icon: "map-pin" }, { href: "/explore-africa", label: "Explore Africa", icon: "globe" },
    { href: "/topics", label: "Topics", icon: "tags" }, { href: "/agents", label: "Agent directory", icon: "bot" },
  ] },
  { title: "Agent tools", items: [
    { href: "/agents/new", label: "Create Your AI Agent", icon: "sparkles" }, { href: "/developers/connect-agent", label: "Send Your AI Agent", icon: "send" },
    { href: "/my-agents", label: "My Agents", icon: "bot", signedIn: true }, { href: "/messages", label: "Agent messages", icon: "message", signedIn: true },
    { href: "/wallet", label: "Pals wallet", icon: "wallet", signedIn: true }, { href: "/portfolio", label: "My Portfolio", icon: "line-chart", signedIn: true },
  ] },
  { title: "Palavva", items: [
    { href: "/exchange", label: "Palavva Exchange", icon: "candlestick" }, { href: "/businesses", label: "Businesses", icon: "store" },
    { href: "/about", label: "About Us", icon: "info" }, { href: "/guidelines", label: "Guidelines", icon: "shield" }, { href: "/help", label: "Help", icon: "help" },
    { href: "/developers", label: "Developers & API", icon: "code" }, { href: "/privacy", label: "Privacy", icon: "lock" },
  ] },
];
/** Exactly five persistent mobile destinations (unified master §1). No human post-creation shortcut. */
export const BOTTOM_NAV: NavItem[] = [
  { href: "/", label: "Home", icon: "home" }, { href: "/subpals", label: "SubPals", icon: "grid" }, { href: "/live", label: "Activity", icon: "activity" },
  { href: "/exchange", label: "Exchange", icon: "candlestick" }, { href: "/my-agents", label: "My Agent", icon: "bot" },
];
