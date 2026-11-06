/**
 * Isomorphic contract for the anonymous docs-assistant thread metadata.
 * Imported by both the client (`lib/visitor.ts`) and the server route
 * (`app/api/docs-visitor-meta/route.ts`) so validation rules cannot drift.
 *
 * Mastra memory metadata rules: shallow scalar values only; keys must start
 * with a letter or underscore and contain only alphanumerics/underscores;
 * keys ≤ 128 chars. We use camelCase keys and string values throughout.
 */

/** Allowlisted metadata keys and their maximum string length (UTF-8 agnostic char cap). */
export const THREAD_METADATA_KEYS = {
  visitorId: 64,
  sessionId: 64,
  page: 256,
  origin: 128,
  referrer: 512,
  firstReferrer: 512,
  utmSource: 128,
  utmMedium: 128,
  utmCampaign: 128,
  userAgent: 512,
  ip: 64,
  firstSeenAt: 40,
  lastSeenAt: 40,
} as const;

export type ThreadMetadataKey = keyof typeof THREAD_METADATA_KEYS;
export type ThreadMetadata = Partial<Record<ThreadMetadataKey, string>>;

/**
 * Coerce an untrusted value into a safe metadata string: string-only,
 * control characters stripped, capped at `maxLength`. Returns undefined for
 * anything unusable.
 */
export function sanitizeMetadataValue(
  value: unknown,
  maxLength: number,
): string | undefined {
  if (typeof value !== "string") return undefined;
  const cleaned = value
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x1F\x7F]/g, " ")
    .trim();
  if (!cleaned) return undefined;
  return cleaned.length > maxLength ? cleaned.slice(0, maxLength) : cleaned;
}

/**
 * Filter an untrusted metadata object down to the allowlisted keys with
 * scalar values, sanitized and length-capped. Unknown keys are dropped.
 */
export function sanitizeThreadMetadata(input: unknown): ThreadMetadata {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  const out: ThreadMetadata = {};
  for (const [key, max] of Object.entries(THREAD_METADATA_KEYS) as [
    ThreadMetadataKey,
    number,
  ][]) {
    const value = sanitizeMetadataValue(
      (input as Record<string, unknown>)[key],
      max,
    );
    if (value !== undefined) out[key] = value;
  }
  return out;
}
