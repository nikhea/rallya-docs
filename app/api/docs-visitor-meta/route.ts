/**
 * POST /api/docs-visitor-meta
 *
 * Best-effort sink for anonymous docs-assistant attribution. The browser calls
 * this same-origin route when a run ends; this route attaches the visitor's
 * IP (server-side) and upserts the merged metadata onto the Mastra memory
 * thread via the documented `@mastra/client-js` → `/api/memory/*` contract.
 *
 * Why a proxy instead of direct browser → Mastra calls:
 * - the agent enforces SimpleAuth on `/api/*` when DOCS_AGENT_*_TOKEN is set,
 *   so direct browser calls would 401 in production;
 * - the admin token never ships to the browser;
 * - the visitor IP is observed by THIS edge, not by the agent (which would
 *   only see this server's egress IP);
 * - same-origin → no CORS/preflight.
 *
 * Trust model: everything the browser sends is analytics signal, not
 * identity. The server owns `ip`, `firstSeenAt`, `lastSeenAt`, `firstReferrer`
 * and they are stripped from client input. IP is read from proxy headers and
 * is only as trustworthy as the proxy setting them (Vercel/Cloudflare do).
 */
import { NextResponse } from "next/server";
import { MastraClient } from "@mastra/client-js";

import {
  sanitizeThreadMetadata,
  type ThreadMetadata,
} from "@/lib/thread-metadata";

export const dynamic = "force-dynamic";

const DOCS_AGENT_ID = "docs-agent";
/** Server-owned keys — clients may never set or overwrite these. */
const SERVER_OWNED_KEYS = ["ip", "firstSeenAt", "lastSeenAt", "firstReferrer"] as const;

const json = (body: Record<string, unknown>, status = 200) =>
  NextResponse.json(body, { status, headers: { "cache-control": "no-store" } });

const controlChars = new RegExp("[\\u0000-\\u001F\\u007F]", "g");

/** Best-effort client IP from proxy headers; undefined when untrusted/absent. */
function getClientIp(headers: Headers): string | undefined {
  const cf = headers.get("cf-connecting-ip");
  if (cf) return normalizeIp(cf);
  const fwd = headers.get("x-forwarded-for");
  if (fwd) {
    const first = fwd.split(",")[0]?.trim();
    if (first) return normalizeIp(first);
  }
  const real = headers.get("x-real-ip");
  return real ? normalizeIp(real) : undefined;
}

/** IPs are digits, dots and hex colons only; anything else is rejected. */
function normalizeIp(value: string): string | undefined {
  const trimmed = value.trim().replace(controlChars, "");
  const ipv4 = /^(\d{1,3}\.){3}\d{1,3}$/;
  const ipv6 = /^[0-9a-fA-F:.]{2,45}$/;
  if (!ipv4.test(trimmed) && !ipv6.test(trimmed)) return undefined;
  return trimmed.slice(0, 45);
}

const isHttpStatus = (err: unknown): err is { status: number } =>
  typeof err === "object" &&
  err !== null &&
  "status" in err &&
  typeof (err as { status: unknown }).status === "number";

export async function POST(request: Request) {
  // --- Parse & validate input ----------------------------------------------
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const rawThreadId = (body as { threadId?: unknown } | null)?.threadId;
  const threadId =
    typeof rawThreadId === "string"
      ? rawThreadId.replace(controlChars, "").trim()
      : "";
  if (!threadId || threadId.length > 128) {
    return json({ error: "invalid_thread_id" }, 400);
  }

  // Allowlisted keys only; server-owned keys stripped.
  const clientMeta: ThreadMetadata = sanitizeThreadMetadata(
    (body as { metadata?: unknown } | null)?.metadata,
  );
  for (const key of SERVER_OWNED_KEYS) {
    delete clientMeta[key];
  }

  // --- Build merged metadata -------------------------------------------------
  const now = new Date().toISOString();
  const ip = getClientIp(request.headers);

  const internalUrl = process.env.DOCS_AGENT_INTERNAL_URL ?? "http://localhost:4111";
  const token = process.env.DOCS_AGENT_ADMIN_TOKEN;

  const mastra = new MastraClient({
    baseUrl: internalUrl,
    // See BaseResource docs: retries add latency, not correctness — keep modest.
    retries: 2,
    backoffMs: 200,
    maxBackoffMs: 2000,
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });

  const thread = mastra.getMemoryThread({ threadId, agentId: DOCS_AGENT_ID });

  let existingMeta: Record<string, unknown> = {};
  try {
    const existing = await thread.get();
    if (existing && typeof existing.metadata === "object" && existing.metadata !== null) {
      existingMeta = existing.metadata as Record<string, unknown>;
    }
  } catch (err) {
    if (isHttpStatus(err) && err.status === 404) {
      // Thread is created lazily by the agent during the run; a runEnd that
      // fires before creation (or a failed run) lands here.
      return json({ error: "thread_not_found" }, 404);
    }
    console.error("[docs-visitor-meta] failed to read thread", err);
    return json({ error: "mastra_unreachable" }, 502);
  }

  const str = (v: unknown): string | undefined =>
    typeof v === "string" && v ? v : undefined;

  const merged: Record<string, unknown> = {
    ...existingMeta,
    ...clientMeta,
    // Write-once fields: keep whatever was stored first.
    firstSeenAt: str(existingMeta.firstSeenAt) ?? now,
    firstReferrer: str(existingMeta.firstReferrer) ?? clientMeta.referrer,
    // Server-owned refreshables.
    lastSeenAt: now,
    ip: ip ?? str(existingMeta.ip),
  };

  try {
    await thread.update({ metadata: merged });
  } catch (err) {
    console.error("[docs-visitor-meta] failed to update thread", err);
    return json({ error: "mastra_unreachable" }, 502);
  }

  return json({ ok: true });
}
