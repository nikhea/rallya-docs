import { defineField, defineType } from "sanity";
import { sidebarIcons } from "./icons";

export { sidebarIcons };

export const docSection = defineType({
  name: "docSection",
  title: "Docs Section",
  type: "document",
  fieldsets: [
    {
      name: "system",
      title: "System",
      options: { collapsible: true, collapsed: true },
    },
  ],
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
    defineField({
      name: "managedBy",
      title: "Managed By",
      type: "string",
      description:
        'Set to "repo" by scripts/sync-docs-to-sanity.mjs. Documents without this marker are never overwritten or deleted by the sync.',
      readOnly: true,
      hidden: true,
      fieldset: "system",
    }),
    defineField({
      name: "bodyHash",
      title: "Body Hash",
      type: "string",
      description:
        "sha256 of the last synced content; used to skip unchanged documents.",
      readOnly: true,
      hidden: true,
      fieldset: "system",
    }),
  ],
});

export const docPage = defineType({
  name: "docPage",
  title: "Docs Page",
  type: "document",
  fieldsets: [
    {
      name: "system",
      title: "System",
      options: { collapsible: true, collapsed: true },
    },
  ],
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
    defineField({
      name: "managedBy",
      title: "Managed By",
      type: "string",
      description:
        'Set to "repo" by scripts/sync-docs-to-sanity.mjs. Documents without this marker are never overwritten or deleted by the sync.',
      readOnly: true,
      hidden: true,
      fieldset: "system",
    }),
    defineField({
      name: "bodyHash",
      title: "Body Hash",
      type: "string",
      description:
        "sha256 of the last synced content; used to skip unchanged documents.",
      readOnly: true,
      hidden: true,
      fieldset: "system",
    }),
  ],
});

export const schemaTypes = [docSection, docPage];
