/**
 * One-time migration: push the raw MDX docs in `content/docs/` into Sanity as
 * `docSection` + `docPage` documents.
 *
 * Usage: npm run migrate:docs
 * Requires SANITY_API_WRITE_TOKEN (plus NEXT_PUBLIC_SANITY_PROJECT_ID /
 * NEXT_PUBLIC_SANITY_DATASET) in .env.local.
 *
 * The raw MDX files are kept in the repo for reference only; Sanity is the
 * source of truth for published content afterwards.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@sanity/client";

const contentDir = new URL("../content/docs/", import.meta.url).pathname;

// --- tiny .env.local parser -------------------------------------------------
const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((line) => line.trim() && !line.startsWith("#"))
    .map((line) => {
      const idx = line.indexOf("=");
      return [line.slice(0, idx), line.slice(idx + 1)];
    }),
);

const projectId = env.NEXT_PUBLIC_SANITY_PROJECT_ID;
const dataset = env.NEXT_PUBLIC_SANITY_DATASET || "production";
const token = env.SANITY_API_WRITE_TOKEN;

if (!projectId || !token) {
  console.error(
    "Missing NEXT_PUBLIC_SANITY_PROJECT_ID or SANITY_API_WRITE_TOKEN in .env.local",
  );
  process.exit(1);
}

const client = createClient({
  projectId,
  dataset,
  apiVersion: "2025-11-01",
  token,
  useCdn: false,
});

// --- parse raw mdx -----------------------------------------------------------
function parseFrontmatter(raw) {
  const match = /^---\n([\s\S]*?)\n---\n?/.exec(raw);
  if (!match) return { fields: {}, body: raw };

  const fields = {};
  for (const line of match[1].split("\n")) {
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    if (key) fields[key] = value;
  }
  return { fields, body: raw.slice(match[0].length).trimEnd() + "\n" };
}

// --- read meta.json for sidebar order ---------------------------------------
const meta = JSON.parse(readFileSync(join(contentDir, "meta.json"), "utf8"));

const sectionMeta = [];
const pageOrder = []; // { slug, sectionTitle|null, indexWithinGroup }

let currentSection = null;
for (const entry of meta.pages) {
  const separator = /^---(?:\[([^\]]*)])?(.+)---$/.exec(entry);
  if (separator) {
    currentSection = { icon: separator[1] || "", title: separator[2] };
    sectionMeta.push(currentSection);
    continue;
  }
  const counts = pageOrder.filter((p) => p.sectionTitle === currentSection?.title);
  pageOrder.push({
    slug: entry,
    sectionTitle: currentSection?.title ?? null,
    index: counts.length,
  });
}

// --- migrate ----------------------------------------------------------------
async function main() {
  console.log(`Migrating docs to project ${projectId} (${dataset})`);

  // sections first so page references resolve
  const sectionIds = new Map();
  for (const [i, section] of sectionMeta.entries()) {
    const id = `docSection.${section.title.toLowerCase().replace(/\s+/g, "-")}`;
    sectionIds.set(section.title, id);
    await client.createOrReplace({
      _id: id,
      _type: "docSection",
      title: section.title,
      icon: section.icon,
      order: i,
    });
    console.log(`  section: ${section.title} (icon: ${section.icon})`);
  }

  for (const { slug, sectionTitle, index } of pageOrder) {
    const raw = readFileSync(join(contentDir, `${slug}.mdx`), "utf8");
    const { fields, body } = parseFrontmatter(raw);

    const doc = {
      _id: `docPage.${slug}`,
      _type: "docPage",
      title: fields.title ?? slug,
      slug: { _type: "slug", current: slug },
      description: fields.description ?? "",
      icon: fields.icon ?? "",
      order: index,
      body,
    };
    if (sectionTitle) doc.section = { _type: "reference", _ref: sectionIds.get(sectionTitle) };

    await client.createOrReplace(doc);
    console.log(`  page: ${slug} (${doc.title})${sectionTitle ? ` → ${sectionTitle}` : ""}`);
  }

  console.log("Migration complete.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
