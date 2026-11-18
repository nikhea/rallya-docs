/**
 * Icons referenced by the docs sidebar. Values are PascalCase lucide-react
 * icon names, resolved at build time by `lucideIconsPlugin()`.
 *
 * Shared by the Sanity schema (Studio dropdowns) and
 * `scripts/sync-docs-to-sanity.mjs --check` (frontmatter validation).
 */
export const sidebarIcons = [
  "House",
  "Rocket",
  "Blocks",
  "ShieldCheck",
  "Building",
  "Ticket",
  "CreditCard",
  "QrCode",
  "Package",
  "Wallet",
  "Code",
  "Braces",
  "Wrench",
  "Route",
  "Database",
  "KeyRound",
  "Server",
  "Bot",
  "ShoppingBag",
  "Hammer",
  "Library",
] as const;

export type SidebarIcon = (typeof sidebarIcons)[number];
