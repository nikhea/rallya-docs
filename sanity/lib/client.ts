import { createClient } from "next-sanity";
import type { SanityClient } from "@sanity/client";

export const dataset = process.env.NEXT_PUBLIC_SANITY_DATASET ?? "production";
export const apiVersion = "2025-11-01";

let cachedClient: SanityClient | null = null;

/**
 * Sanity client, created lazily: module evaluation must not throw when the
 * env vars are absent (e.g. a build in an environment without secrets).
 */
export function getClient(): SanityClient {
  if (!cachedClient) {
    cachedClient = createClient({
      projectId: getProjectId(),
      dataset,
      apiVersion,
      // private dataset: build-time reads require a read token
      token: process.env.SANITY_API_READ_TOKEN,
      useCdn: false,
      perspective: "published",
    });
  }
  return cachedClient;
}

export function getProjectId(): string {
  const projectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID;
  if (!projectId) {
    throw new Error(
      "NEXT_PUBLIC_SANITY_PROJECT_ID is not set. Copy .env.example to .env.local locally, or set the NEXT_PUBLIC_SANITY_* / SANITY_* env vars in your build environment (see .env.example).",
    );
  }
  return projectId;
}
