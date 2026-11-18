/**
 * Icons referenced by the docs sidebar. Values are PascalCase lucide-react
 * icon names, resolved at build time by `lucideIconsPlugin()`.
 *
 * The list lives in `icons.json` so the Sanity schema (Studio dropdowns) and
 * `scripts/sync-docs-to-sanity.mjs --check` (frontmatter validation) share one
 * source of truth.
 */
import icons from "./icons.json";

export const sidebarIcons = icons;
