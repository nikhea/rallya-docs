import { evaluate } from "@mdx-js/mdx";
import * as runtime from "react/jsx-runtime";
import type { MDXComponents } from "mdx/types";
import { llms, loader } from "fumadocs-core/source";
import type { MetaData, PageData, StaticSource } from "fumadocs-core/source";
import type { TOCItemType } from "fumadocs-core/toc";
import type { StructuredData } from "fumadocs-core/mdx-plugins";
import {
  rehypeCode,
  rehypeToc,
  remarkGfm,
  remarkHeading,
  remarkStructure,
} from "fumadocs-core/mdx-plugins";
import { lucideIconsPlugin } from "fumadocs-core/source/plugins/lucide-icons";
import { pagesQuery, sectionsQuery } from "@/sanity/lib/queries";
import { getClient } from "@/sanity/lib/client";

type SanitySection = {
  _id: string;
  title: string;
  icon?: string | null;
  order: number;
};

type SanityPage = {
  _id: string;
  title: string;
  slug: string;
  description?: string | null;
  icon?: string | null;
  order: number;
  body?: string | null;
  section?: SanitySection | null;
};

type MdxExports = {
  default: React.ComponentType<{ components?: MDXComponents }>;
  toc?: TOCItemType[];
  structuredData?: StructuredData;
};

type DocPageData = PageData & {
  body: MdxExports["default"];
  toc?: TOCItemType[];
  full?: boolean;
  structuredData?: StructuredData;
  /** mdx source doubles as markdown for llms.txt / copy page */
  getText: (type?: "raw" | "processed") => Promise<string>;
};

type SourceFile =
  | { type: "page"; path: string; data: DocPageData }
  | { type: "meta"; path: string; data: MetaData };

/**
 * Compile a Sanity-hosted MDX string with the same plugin preset
 * `fumadocs-mdx` uses, so `toc` / `structuredData` / code highlighting come
 * out identical to the previous file-based pipeline.
 */
async function compileMdx(body: string): Promise<MdxExports> {
  return (await evaluate(body, {
    ...runtime,
    development: false,
    remarkPlugins: [
      remarkGfm,
      [remarkHeading, { generateToc: false }],
      [remarkStructure, { exportAs: "structuredData" }],
    ],
    rehypePlugins: [rehypeCode, rehypeToc],
  })) as MdxExports;
}

/**
 * Reproduce the sidebar tree from Sanity: unsectioned pages first, then each
 * section rendered as a separator followed by its pages (both sorted by
 * `order`).
 */
function buildMetaPages(pages: SanityPage[], sections: SanitySection[]) {
  const tree: MetaData["pages"] = pages
    .filter((page) => !page.section)
    .map((page) => page.slug);

  for (const section of sections) {
    const children = pages
      .filter((page) => page.section?._id === section._id)
      .map((page) => page.slug);

    tree.push(`---[${section.icon ?? ""}]${section.title}---`, ...children);
  }

  return tree;
}

async function build() {
  const client = getClient();
  const [pages, sections] = await Promise.all([
    client.fetch<SanityPage[]>(pagesQuery),
    client.fetch<SanitySection[]>(sectionsQuery),
  ]);

  const files: SourceFile[] = await Promise.all(
    pages.map(async (page) => {
      if (!page.body) {
        throw new Error(`Sanity doc "${page.slug}" has no body`);
      }
      const { default: Body, toc, structuredData } = await compileMdx(page.body);
      const mdxSource = page.body;

      return {
        type: "page" as const,
        path: `${page.slug}.mdx`,
        data: {
          title: page.title,
          description: page.description ?? undefined,
          icon: page.icon ?? undefined,
          body: Body,
          toc,
          structuredData,
          async getText() {
            return mdxSource;
          },
        },
      };
    }),
  );

  files.push({
    type: "meta",
    path: "meta.json",
    data: {
      title: "Rallya Docs",
      pages: buildMetaPages(pages, sections),
    },
  });

  const source = loader<
    StaticSource<{ pageData: DocPageData; metaData: MetaData }>,
    undefined
  >({
    baseUrl: "/docs",
    plugins: [lucideIconsPlugin()],
    source: { files },
  });

  const docsLlms = llms(source, {
    renderPage: async (page) =>
      `# ${page.data.title} (${page.url})\n\n${await page.data.getText()}`,
  });

  return { source, docsLlms };
}

// The cache lives on globalThis on purpose: Turbopack can produce separate
// module instances per route bundle, and the revalidation webhook (a route
// handler) must invalidate the same cache the pages read from.
type DocsCache = Awaited<ReturnType<typeof build>>;

const globalCache = globalThis as { __rallyaDocsSource?: Promise<DocsCache> | null };

/**
 * Cached Sanity-backed source (single in-flight promise). Re-fetched from
 * Sanity after `invalidateSource()` — called by the revalidation webhook.
 */
export function getSource(): Promise<DocsCache> {
  if (!globalCache.__rallyaDocsSource) globalCache.__rallyaDocsSource = build();
  return globalCache.__rallyaDocsSource;
}

/** Drop the cached source so the next access re-fetches from Sanity. */
export function invalidateSource() {
  globalCache.__rallyaDocsSource = null;
}
