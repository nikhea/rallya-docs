import { getSource } from "@/lib/source";
import { createFromSource } from "fumadocs-core/search/server";

// passing the source as a getter re-indexes the search server whenever the
// source is invalidated by the Sanity revalidation webhook
export const { GET } = createFromSource(async () => (await getSource()).source);
