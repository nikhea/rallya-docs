/**
 * POST /api/docs-feedback
 *
 * Same-origin sink for thumbs feedback on assistant replies (see
 * plan/anony_vistor.md and components/assistant-ui/elements/message-feedback.aui.tsx).
 *
 * The browser sends `{ traceId, type, comment?, visitorId? }` where `traceId`
 * rides on every streamed assistant message (`messageMetadata` on the `start`
 * part). Server-side, this route:
 *
 * 1. Validates the payload (traceId length/charset, capped comment/visitorId,
 *    no control characters).
 * 2. Fetches the trace from Mastra and confirms it is a docs-agent run —
 *    this is the required "does this traceId belong to us" check before
 *    writing feedback anchored to it, because the value comes from the client.
 * 3. Writes the feedback record with `feedbackType: "thumbs"` (value ±1) via
 *    `mastraClient.createFeedback` with context mode "provided" (OSS default):
 *    context fields are asserted by THIS server, not rehydrated or trusted
 *    from the client. `feedbackUserId` carries the anonymous visitor id for
 *    analytics grouping — self-reported, never for identity/security.
 *
 * The agent's admin token never ships to the browser. Everything the client
 * sends is analytics signal; IP is deliberately not attached to feedback.
 */
import { NextResponse } from "next/server";
import { MastraClient } from "@mastra/client-js";

import { sanitizeMetadataValue } from "@/lib/thread-metadata";

export const dynamic = "force-dynamic";

const DOCS_AGENT_ID = "docs-agent";
const DOCS_AGENT_ENTITY_NAME = "Rallya Docs Agent";
const MAX_TRACE_ID = 128;
const MAX_COMMENT = 1000;
const MAX_VISITOR_ID = 64;

const controlChars = new RegExp("[\\u0000-\\u001F\\u007F]", "g");

const json = (body: Record<string, unknown>, status = 200) =>
  NextResponse.json(body, { status, headers: { "cache-control": "no-store" } });

const isHttpStatus = (err: unknown): err is { status: number } =>
  typeof err === "object" &&
  err !== null &&
  "status" in err &&
  typeof (err as { status: unknown }).status === "number";

const clean = (value: unknown, max: number) =>
  sanitizeMetadataValue(value, max);

export async function POST(request: Request) {
  // --- Parse & validate input ----------------------------------------------
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const input = body as {
    traceId?: unknown;
    type?: unknown;
    comment?: unknown;
    visitorId?: unknown;
  } | null;

  const traceId =
    typeof input?.traceId === "string"
      ? input.traceId.replace(controlChars, "").trim()
      : "";
  if (!traceId || traceId.length > MAX_TRACE_ID) {
    return json({ error: "invalid_trace_id" }, 400);
  }

  const type = input?.type;
  if (type !== "positive" && type !== "negative") {
    return json({ error: "invalid_type" }, 400);
  }

  const comment = clean(input?.comment, MAX_COMMENT);
  const visitorId = clean(input?.visitorId, MAX_VISITOR_ID);

  // --- Mastra client (server-only credentials) -------------------------------
  const internalUrl = process.env.DOCS_AGENT_INTERNAL_URL ?? "http://localhost:4111";
  const token = process.env.DOCS_AGENT_ADMIN_TOKEN;

  const mastra = new MastraClient({
    baseUrl: internalUrl,
    retries: 2,
    backoffMs: 200,
    maxBackoffMs: 2000,
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });

  // --- Verify the trace is a docs-agent run before anchoring feedback ----------
  let rootSpan:
    | {
        parentSpanId?: string | null;
        entityType?: string | null;
        entityId?: string | null;
        entityName?: string | null;
        rootEntityType?: string | null;
        rootEntityId?: string | null;
        rootEntityName?: string | null;
        threadId?: string | null;
        resourceId?: string | null;
        environment?: string | null;
      }
    | undefined;

  try {
    const trace = await mastra.getTrace(traceId);
    const spans =
      (trace as { spans?: Array<NonNullable<typeof rootSpan>> } | null)?.spans ?? [];
    rootSpan = spans.find((s) => !s?.parentSpanId) ?? spans[0];
  } catch (err) {
    if (isHttpStatus(err) && (err.status === 404 || err.status === 400)) {
      return json({ error: "trace_not_found" }, 404);
    }
    console.error("[docs-feedback] failed to fetch trace", err);
    return json({ error: "mastra_unreachable" }, 502);
  }

  const entityId = rootSpan?.rootEntityId ?? rootSpan?.entityId;
  const entityName = rootSpan?.rootEntityName ?? rootSpan?.entityName;
  const entityType = rootSpan?.rootEntityType ?? rootSpan?.entityType;

  const isDocsAgent =
    entityId === DOCS_AGENT_ID ||
    entityName === DOCS_AGENT_ID ||
    entityName === DOCS_AGENT_ENTITY_NAME ||
    entityType === "agent";

  if (!isDocsAgent) {
    return json({ error: "trace_not_eligible" }, 403);
  }

  // --- Write the feedback record -------------------------------------------------
  try {
    // No `contextMode`: the OSS server defaults to "provided", which is what
    // we want — context is asserted by this server, not rehydrated.
    const result = (await mastra.createFeedback({
      feedback: {
        traceId,
        feedbackSource: "user",
        feedbackType: "thumbs",
        value: type === "positive" ? 1 : -1,
        ...(comment ? { comment } : {}),
        ...(visitorId ? { feedbackUserId: visitorId } : {}),
        entityType: "agent",
        entityId: DOCS_AGENT_ID,
        entityName: entityName ?? DOCS_AGENT_ENTITY_NAME,
        ...(rootSpan?.threadId ? { threadId: rootSpan.threadId } : {}),
        ...(rootSpan?.resourceId ? { resourceId: rootSpan.resourceId } : {}),
        ...(rootSpan?.environment ? { environment: rootSpan.environment } : {}),
        tags: ["docs-feedback"],
      },
    })) as { success?: boolean; data?: { feedbackId?: string } } | undefined;

    return json({ ok: true, feedbackId: result?.data?.feedbackId });
  } catch (err) {
    console.error("[docs-feedback] failed to create feedback", err);
    return json({ error: "mastra_unreachable" }, 502);
  }
}
