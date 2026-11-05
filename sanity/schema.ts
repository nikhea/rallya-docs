import { defineField, defineType } from "sanity";

/**
 * Icons referenced by the sidebar. Values are PascalCase lucide-react icon
 * names, resolved at build time by `lucideIconsPlugin()`.
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

export const docSection = defineType({
  name: "docSection",
  title: "Docs Section",
  type: "document",
  fields: [
    defineField({
      name: "title",
      title: "Title",
      type: "string",
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: "icon",
      title: "Sidebar Icon",
      type: "string",
      options: {
        list: sidebarIcons.map((icon) => ({ title: icon, value: icon })),
      },
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: "order",
      title: "Order",
      type: "number",
      validation: (rule) => rule.required(),
    }),
  ],
});

export const docPage = defineType({
  name: "docPage",
  title: "Docs Page",
  type: "document",
  fields: [
    defineField({
      name: "title",
      title: "Title",
      type: "string",
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: "slug",
      title: "Slug",
      type: "slug",
      options: { source: "title", maxLength: 96 },
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: "description",
      title: "Description",
      type: "text",
      rows: 2,
    }),
    defineField({
      name: "icon",
      title: "Sidebar Icon",
      type: "string",
      options: {
        list: sidebarIcons.map((icon) => ({ title: icon, value: icon })),
      },
    }),
    defineField({
      name: "section",
      title: "Sidebar Section",
      type: "reference",
      to: [{ type: "docSection" }],
      description:
        "Sections render as sidebar separators. Pages without a section appear before the first section.",
    }),
    defineField({
      name: "order",
      title: "Order",
      type: "number",
      description: "Sort position within the sidebar group (lower comes first).",
      initialValue: 0,
    }),
    defineField({
      name: "body",
      title: "Body (MDX)",
      type: "text",
      rows: 30,
      description:
        "Markdown/MDX source. Fenced code blocks, tables and links are supported.",
    }),
  ],
});

export const schemaTypes = [docSection, docPage];
