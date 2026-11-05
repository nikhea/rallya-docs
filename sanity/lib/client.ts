import { createClient } from "next-sanity";
import type { SanityClient } from "@sanity/client";

/**
 * Project "Rallya Docs" (org: rallya). These are not secrets — the embedded
 * studio ships them to the browser by design — so they have committed
 * defaults and the env vars only exist as overrides for other deployments.
 */
const DEFAULT_PROJECT_ID = "ejoyp5f4";
const DEFAULT_DATASET = "production";

export const dataset = process.env.NEXT_PUBLIC_SANITY_DATASET || DEFAULT_DATASET;
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
  return process.env.NEXT_PUBLIC_SANITY_PROJECT_ID || DEFAULT_PROJECT_ID;
}
