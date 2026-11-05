import { defineConfig } from "sanity";
import { structureTool } from "sanity/structure";
import { schemaTypes } from "./sanity/schema";

const projectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID;
const dataset = process.env.NEXT_PUBLIC_SANITY_DATASET ?? "production";

if (!projectId) {
  throw new Error("NEXT_PUBLIC_SANITY_PROJECT_ID is not set");
}

export default defineConfig({
  name: "rallya-docs",
  title: "Rallya Docs",
  projectId,
  dataset,
  plugins: [structureTool()],
  schema: { types: schemaTypes },
});
