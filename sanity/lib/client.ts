import { createClient } from "next-sanity";

export const projectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID;
export const dataset = process.env.NEXT_PUBLIC_SANITY_DATASET ?? "production";
export const apiVersion = "2025-11-01";

export const client = createClient({
  projectId,
  dataset,
  apiVersion,
  // private dataset: build-time reads require a read token
  token: process.env.SANITY_API_READ_TOKEN,
  useCdn: false,
  perspective: "published",
});
