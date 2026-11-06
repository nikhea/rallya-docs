/**
 * Anonymous visitor identity for the docs assistant. Client-only.
 *
 * - visitorId: long-lived UUID in localStorage. Also used as the Mastra
 *   `resourceId` so all threads for one anonymous browser group together.
 * - sessionId: per-tab UUID in sessionStorage; groups one browsing session.
 * - UTM parameters: captured from the URL on first load and cached in
 *   sessionStorage so they survive in-app navigation.
 *
 * Nothing here is authenticated or trustworthy — it is analytics signal only.
 * See plan/anony_vistor.md.
 */
import {
  sanitizeThreadMetadata,
  THREAD_METADATA_KEYS,
  type ThreadMetadata,
} from "./thread-metadata";

const VISITOR_ID_KEY = "docs_visitor_id";
const SESSION_ID_KEY = "docs_session_id";
const UTM_KEY = "docs_utm";

const hasWindow = () => typeof window !== "undefined";

const newId = (): string =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;

/** Long-lived anonymous visitor id; created on first call, then stable. */
export function getOrCreateVisitorId(): string {
  if (!hasWindow()) return "";
  try {
    const existing = window.localStorage.getItem(VISITOR_ID_KEY)?.trim();
    if (existing) return existing;
    const created = newId();
    window.localStorage.setItem(VISITOR_ID_KEY, created);
    return created;
  } catch {
    // Storage unavailable (private mode, quota, disabled cookies/storage).
    return newId();
  }
}

/** Per-tab session id; stable for the lifetime of the tab. */
export function getSessionId(): string {
  if (!hasWindow()) return "";
  try {
    const existing = window.sessionStorage.getItem(SESSION_ID_KEY)?.trim();
    if (existing) return existing;
    const created = newId();
    window.sessionStorage.setItem(SESSION_ID_KEY, created);
    return created;
  } catch {
    return newId();
  }
}

type Utm = Pick<ThreadMetadata, "utmSource" | "utmMedium" | "utmCampaign">;

/**
 * UTM params for this session: read from the URL on first load, then served
 * from sessionStorage so in-app navigation doesn't lose attribution.
 */
export function getUtmAttribution(): Utm {
  if (!hasWindow()) return {};
  const max = THREAD_METADATA_KEYS;
  const cap = (value: string | null, len: number) => {
    const v = value?.trim();
    return v ? v.slice(0, len) : undefined;
  };

  try {
    const cached = window.sessionStorage.getItem(UTM_KEY);
    if (cached) {
      const parsed = JSON.parse(cached) as Record<string, unknown>;
      return {
        utmSource: cap(typeof parsed.utmSource === "string" ? parsed.utmSource : null, max.utmSource),
        utmMedium: cap(typeof parsed.utmMedium === "string" ? parsed.utmMedium : null, max.utmMedium),
        utmCampaign: cap(typeof parsed.utmCampaign === "string" ? parsed.utmCampaign : null, max.utmCampaign),
      };
    }

    const params = new URLSearchParams(window.location.search);
    const utm: Utm = {
      utmSource: cap(params.get("utm_source"), max.utmSource),
      utmMedium: cap(params.get("utm_medium"), max.utmMedium),
      utmCampaign: cap(params.get("utm_campaign"), max.utmCampaign),
    };
    if (utm.utmSource || utm.utmMedium || utm.utmCampaign) {
      window.sessionStorage.setItem(UTM_KEY, JSON.stringify(utm));
      return utm;
    }
    return {};
  } catch {
    return {};
  }
}

/** Drop keys whose values are empty after sanitization. */
const compact = (meta: ThreadMetadata): ThreadMetadata =>
  Object.fromEntries(
    Object.entries(meta).filter(([, v]) => typeof v === "string" && v.length > 0),
  ) as ThreadMetadata;

/**
 * Build the thread-metadata payload for a run that just ended.
 * `page` should be the pathname the user asked from (e.g. /docs/quickstart).
 * IP is attached server-side by the route handler — never here.
 */
export function buildThreadMetadata(page: string): ThreadMetadata {
  const utm = getUtmAttribution();
  const raw: ThreadMetadata = {
    visitorId: getOrCreateVisitorId(),
    sessionId: getSessionId(),
    page,
    origin: hasWindow() ? window.location.origin : undefined,
    referrer: hasWindow() ? document.referrer || undefined : undefined,
    userAgent: hasWindow() ? window.navigator.userAgent : undefined,
    ...utm,
  };
  return compact(sanitizeThreadMetadata(raw));
}
