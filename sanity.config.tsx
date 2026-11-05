import { Suspense } from "react";
import { Skeleton } from "@sanity/ui";
import { defineConfig } from "sanity";
import type { InputProps } from "sanity";
import { structureTool } from "sanity/structure";
import { schemaTypes } from "./sanity/schema";

const projectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID;
const dataset = process.env.NEXT_PUBLIC_SANITY_DATASET ?? "production";

if (!projectId) {
  throw new Error("NEXT_PUBLIC_SANITY_PROJECT_ID is not set");
}

/**
 * Sanity lazy-loads built-in inputs; without a boundary of their own they
 * suspend into Studio's generic skeleton (with a console warning and layout
 * shift). Declaring this boundary — closer to the input than Studio's — makes
 * the fallback reserve a standard input row instead.
 */
function SuspenseInput(props: InputProps) {
  return (
    <Suspense
      fallback={
        <Skeleton animated radius={1} style={{ height: 35, width: "100%" }} />
      }
    >
      {props.renderDefault(props)}
    </Suspense>
  );
}

export default defineConfig({
  name: "rallya-docs",
  title: "Rallya Docs",
  projectId,
  dataset,
  basePath: "/studio",
  plugins: [structureTool()],
  schema: { types: schemaTypes },
  form: {
    components: {
      input: SuspenseInput,
    },
  },
});
