/**
 * Sync the MDX docs in `content/docs/` into Sanity as `docSection` + `docPage`
 * documents.
 *
 * The repo is the source of truth: a push to `main` runs this script in CI,
 * then triggers a production deploy. Sanity is a published target.
 *
 * Usage:
 *   node scripts/sync-docs-to-sanity.mjs            # apply changes
 *   node scripts/sync-docs-to-sanity.mjs --dry-run  # print the plan only
 *
 * Requires SANITY_API_WRITE_TOKEN (in the environment, or .env.local locally).
 * NEXT_PUBLIC_SANITY_PROJECT_ID / NEXT_PUBLIC_SANITY_DATASET fall back to the
 * committed defaults in sanity/lib/client.ts.
 *
 * Documents written here are stamped with `managedBy: "repo"` so later pruning
 * (and manual Studio edits outside the pipeline) can be told apart.
 */
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { compile } from "@mdx-js/mdx";
import { createClient } from "@sanity/client";
import {
  rehypeCode,
  rehypeToc,
  remarkHeading,
  remarkStructure,
} from "fumadocs-core/mdx-plugins";
import remarkGfm from "remark-gfm";

const rootDir = new URL("..", import.meta.url).pathname;
const contentDir = join(rootDir, "content/docs");
const DEFAULT_PROJECT_ID = "ejoyp5f4";
const DEFAULT_DATASET = "production";
const API_VERSION = "2025-11-01";

const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");
const checkOnly = args.has("--check");

const SIDEBAR_ICONS = new Set(
  JSON.parse(readFileSync(join(rootDir, "sanity/icons.json"), "utf8")),
);

// --- env ---------------------------------------------------------------------

/** Load .env.local for local runs without overriding real environment values. */
function loadEnvFile(path) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadEnvFile(join(rootDir, ".env.local"));

const projectId =
  process.env.NEXT_PUBLIC_SANITY_PROJECT_ID || DEFAULT_PROJECT_ID;
const dataset = process.env.NEXT_PUBLIC_SANITY_DATASET || DEFAULT_DATASET;
const token = process.env.SANITY_API_WRITE_TOKEN;

// --- parsing -----------------------------------------------------------------

/** Local ids mirror the historical migration script so existing docs update in place. */
function sectionId(title) {
  return `docSection.${title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")}`;
}

function parseFrontmatter(raw) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(raw);
  if (!match) return { fields: {}, body: raw.trimEnd() + "\n" };

  const fields = {};
  for (const line of match[1].split(/\r?\n/)) {
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key) fields[key] = value;
  }

  return {
    fields,
    body: raw.slice(match[0].length).trimEnd() + "\n",
  };
}

function hashContent(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

/**
 * Read `meta.json` once and build the exact document set the site expects:
 * unsectioned pages first, then each `---[Icon]Section---` separator and its
 * pages, both in manifest order.
 */
function buildManifest() {
  const meta = JSON.parse(readFileSync(join(contentDir, "meta.json"), "utf8"));

  const sections = [];
  const pages = [];
  const pageSlugs = new Set();
  let currentSection = null;
  const orderWithinGroup = new Map();

  for (const entry of meta.pages) {
    const separator = /^---(?:\[([^\]]*)\])?(.+)---$/.exec(entry);

    if (separator) {
      const title = separator[2].trim();
      if (sections.some((section) => section.title === title)) {
        throw new Error(`Duplicate section title in meta.json: "${title}"`);
      }
      const id = sectionId(title);
      if (sections.some((section) => section.id === id)) {
        throw new Error(`Duplicate section id derived from "${title}"`);
      }
      sections.push({
        id,
        title,
        icon: (separator[1] ?? "").trim(),
        order: sections.length,
      });
      currentSection = id;
      continue;
    }

    const slug = entry.trim();
    if (!slug) continue;
    if (pageSlugs.has(slug)) {
      throw new Error(`Duplicate page "${slug}" in meta.json`);
    }
    pageSlugs.add(slug);

    const sourcePath = join(contentDir, `${slug}.mdx`);
    if (!existsSync(sourcePath)) {
      throw new Error(`meta.json lists "${slug}" but ${sourcePath} is missing`);
    }

    const { fields, body } = parseFrontmatter(readFileSync(sourcePath, "utf8"));
    if (!fields.title) {
      throw new Error(`${slug}.mdx is missing a frontmatter "title"`);
    }

    const group = currentSection ?? "__root__";
    const order = orderWithinGroup.get(group) ?? 0;
    orderWithinGroup.set(group, order + 1);

    pages.push({
      id: `docPage.${slug}`,
      slug,
      title: fields.title,
      description: fields.description ?? "",
      icon: fields.icon ?? "",
      order,
      sectionId: currentSection,
      body,
    });
  }

  return { sections, pages };
}

// --- validation --------------------------------------------------------------

/**
 * Reproduce the build-time MDX preset from `lib/source.ts` so a page that
 * passes `--check` cannot fail the production build.
 */
async function compilePage(page) {
  await compile(page.body, {
    remarkPlugins: [
      remarkGfm,
      [remarkHeading, { generateToc: false }],
      [remarkStructure, { exportAs: "structuredData" }],
    ],
    rehypePlugins: [rehypeCode, rehypeToc],
  });
}

/** Everything that can be verified without touching Sanity. */
async function validateDocs({ sections, pages }) {
  const errors = [];
  const manifestSlugs = new Set(pages.map((page) => page.slug));

  for (const file of readdirSync(contentDir)) {
    if (file.endsWith(".mdx") && !manifestSlugs.has(file.slice(0, -4))) {
      errors.push(
        `${file}: not listed in meta.json, so it would not appear in the sidebar`,
      );
    }
  }

  for (const page of pages) {
    if (!/^[a-z0-9][a-z0-9-]*$/.test(page.slug)) {
      errors.push(
        `${page.slug}.mdx: slug must be lowercase letters, digits or dashes`,
      );
    }
    if (page.icon && !SIDEBAR_ICONS.has(page.icon)) {
      errors.push(`${page.slug}.mdx: unknown icon "${page.icon}"`);
    }
  }

  for (const section of sections) {
    if (!section.icon) {
      errors.push(`meta.json: section "${section.title}" needs an icon`);
    } else if (!SIDEBAR_ICONS.has(section.icon)) {
      errors.push(`meta.json: unknown icon "${section.icon}" for "${section.title}"`);
    }
  }

  for (const page of pages) {
    try {
      await compilePage(page);
    } catch (error) {
      errors.push(`${page.slug}.mdx: MDX does not compile — ${error.message}`);
    }
  }

  return errors;
}

// --- documents ---------------------------------------------------------------

function toSectionDoc(section) {
  return {
    _id: section.id,
    _type: "docSection",
    title: section.title,
    icon: section.icon,
    order: section.order,
    managedBy: "repo",
    bodyHash: hashContent({
      title: section.title,
      icon: section.icon,
      order: section.order,
    }),
  };
}

function toPageDoc(page) {
  const doc = {
    _id: page.id,
    _type: "docPage",
    title: page.title,
    slug: { _type: "slug", current: page.slug },
    description: page.description,
    icon: page.icon,
    order: page.order,
    body: page.body,
    managedBy: "repo",
    bodyHash: hashContent({
      title: page.title,
      slug: page.slug,
      description: page.description,
      icon: page.icon,
      order: page.order,
      section: page.sectionId,
      body: page.body,
    }),
  };

  if (page.sectionId) {
    doc.section = { _type: "reference", _ref: page.sectionId };
  }

  return doc;
}

// --- main --------------------------------------------------------------------

async function main() {
  const { sections, pages } = buildManifest();

  const errors = await validateDocs({ sections, pages });
  if (errors.length > 0) {
    console.error(`Docs validation failed (${errors.length}):`);
    for (const error of errors) console.error(`  - ${error}`);
    process.exit(1);
  }

  if (checkOnly) {
    console.log(`OK: ${sections.length} sections, ${pages.length} pages.`);
    return;
  }

  if (!token) {
    console.error(
      "Missing SANITY_API_WRITE_TOKEN (checked the environment and .env.local).",
    );
    process.exit(1);
  }

  const docs = [...sections.map(toSectionDoc), ...pages.map(toPageDoc)];

  const client = createClient({
    projectId,
    dataset,
    apiVersion: API_VERSION,
    token,
    useCdn: false,
  });

  const existing = await client.fetch(
    `*[_type in ["docPage", "docSection"] && managedBy == "repo"]{_id, bodyHash}`,
  );
  const existingHash = new Map(existing.map((doc) => [doc._id, doc.bodyHash]));

  const writes = docs.filter((doc) => existingHash.get(doc._id) !== doc.bodyHash);
  const unchanged = docs.length - writes.length;

  console.log(
    `Sanity ${projectId}/${dataset}: ${sections.length} sections, ${pages.length} pages`,
  );
  console.log(`${writes.length} to write, ${unchanged} unchanged`);

  if (writes.length > 0) {
    for (const doc of writes) {
      const action = existingHash.has(doc._id) ? "update" : "create";
      console.log(`  ${action}: ${doc._id}`);
    }
  }

  if (dryRun) {
    console.log("Dry run: no documents were written.");
    return;
  }

  if (writes.length === 0) {
    console.log("Nothing to do.");
    return;
  }

  const transaction = client.transaction();
  for (const doc of writes) transaction.createOrReplace(doc);
  await transaction.commit();

  console.log(`Synced ${writes.length} document(s).`);
}

main().catch((error) => {
  console.error("Sync failed:", error.message);
  process.exit(1);
});
