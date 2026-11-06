/**
 * GET /api/docs-memory?visitorId=<id>                 → list this visitor's threads
 * GET /api/docs-memory?visitorId=<id>&threadId=<tid>  → that thread's messages
 *
 * Same-origin proxy for this anonymous visitor's conversation history (Mastra
 * is the source of truth; the browser cannot call /api/memory/* directly
 * when the agent enforces SimpleAuth).
 *
 * List mode returns `{ threads: [{ id, title, createdAt, updatedAt }] }`
 * ordered by `updatedAt` DESC (null-title threads included; the client renders
 * a fallback label). Message mode returns UI-message-shaped history
 * reshaped from Mastra's stored `format: 2` parts:
 *   text            -> { type: "text", text }
 *   reasoning       -> { type: "reasoning", text, state: "done" }
 *   tool-invocation -> { type: `tool-<toolName>`, toolCallId, state:
 *                        "output-available", input, output }   (only `result` state)
 *   step-start / data-om-* / signal messages -> dropped
 *
 * Visitor ids are unguessable UUIDs held in the browser's localStorage;
 * anyone presenting one can read that visitor's threads (same threat model
 * as any device-local history). Nothing else is exposed.
 */
import { NextResponse } from "next/server";
import { MastraClient } from "@mastra/client-js";

import { sanitizeMetadataValue } from "@/lib/thread-metadata";

export const dynamic = "force-dynamic";

const DOCS_AGENT_ID = "docs-agent";
const MAX_VALUE = 200;
const MAX_THREAD_ID = 128;
const MESSAGE_LIMIT = 200;
const VISITOR_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{3,63}$/;
const THREAD_ID_PATTERN = /^[^\s]{1,128}$/;

const isHttpStatus = (err: unknown): err is { status: number } =>
  typeof err === "object" &&
  err !== null &&
  "status" in err &&
  typeof (err as { status: unknown }).status === "number";

const isoOrNull = (v: unknown): string | null => {
  if (typeof v === "string") return v;
  if (typeof v === "number" && Number.isFinite(v)) return new Date(v).toISOString();
  if (v instanceof Date) return v.toISOString();
  return v != null ? String(v) : null;
};

const json = (body: Record<string, unknown>, status = 200) =>
  NextResponse.json(body, { status, headers: { "cache-control": "no-store" } });

type MastraPart = { type?: string; [key: string]: unknown };
type MastraMessage = {
  id: string;
  role: string;
  content?: { format?: number | string; parts?: MastraPart[] } | unknown;
};

type UIMessage = {
  id: string;
  role: "user" | "assistant";
  parts: Record<string, unknown>[];
};

const contentParts = (message: MastraMessage): MastraPart[] => {
  const content = message.content;
  if (!content || typeof content !== "object") return [];
  const parts = (content as { parts?: unknown }).parts;
  return Array.isArray(parts) ? (parts as MastraPart[]) : [];
};

/** Reshape one Mastra message into an AI SDK v7 UI message; null when nothing usable remains. */
function toUIMessage(message: MastraMessage): UIMessage | null {
  if (message.role !== "user" && message.role !== "assistant") return null;

  const parts: Record<string, unknown>[] = [];
  for (const part of contentParts(message)) {
    switch (part.type) {
      case "text": {
        const text = typeof part.text === "string" ? part.text : undefined;
        if (text) parts.push({ type: "text", text });
        break;
      }
      case "reasoning": {
        const text =
          typeof part.reasoning === "string"
            ? part.reasoning
            : typeof part.text === "string"
              ? part.text
              : undefined;
        if (text) parts.push({ type: "reasoning", text, state: "done" });
        break;
      }
      case "tool-invocation": {
        const invocation = part.toolInvocation as
          | {
              state?: string;
              toolCallId?: string;
              toolName?: string;
              args?: unknown;
              input?: unknown;
              result?: unknown;
              output?: unknown;
            }
          | undefined;
        if (!invocation || invocation.state !== "result") break;
        if (!invocation.toolName || !invocation.toolCallId) break;
        const output = invocation.result ?? invocation.output;
        const input = invocation.args ?? invocation.input;
        parts.push({
          type: `tool-${invocation.toolName}`,
          toolCallId: invocation.toolCallId,
          state: "output-available",
          input: input ?? {},
          output: output ?? null,
        });
        break;
      }
      default:
        // step-start, data-om-*, sources handled client-side, etc. — drop.
        break;
    }
  }

  if (parts.length === 0) return null;
  return { id: String(message.id), role: message.role as UIMessage["role"], parts };
}

export async function GET(request: Request) {
  const visitorId = new URL(request.url).searchParams.get("visitorId") ?? "";
  if (!VISITOR_ID_PATTERN.test(visitorId) || visitorId.length > MAX_VALUE) {
    return json({ error: "invalid_visitor_id" }, 400);
  }

  // ?threadId= → message mode for THAT thread (after ownership check);
  // no threadId  → list mode for this visitor.
  const threadId = new URL(request.url).searchParams.get("threadId")?.trim();

  const internalUrl = process.env.DOCS_AGENT_INTERNAL_URL ?? "http://localhost:4111";
  const token = process.env.DOCS_AGENT_ADMIN_TOKEN;

  const mastra = new MastraClient({
    baseUrl: internalUrl,
    retries: 2,
    backoffMs: 200,
    maxBackoffMs: 2000,
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });

  if (!threadId) {
    let threads: { id: string; title: string | null; createdAt: string | null; updatedAt: string | null }[] = [];
    try {
      const list = await mastra.listMemoryThreads({
        resourceId: visitorId,
        agentId: DOCS_AGENT_ID,
        perPage: MAX_VALUE,
        orderBy: { field: "updatedAt", direction: "DESC" },
      });
      threads = (list.threads ?? []).map((t) => ({
        id: t.id,
        title:
          typeof t.title === "string" && t.title.trim()
            ? (sanitizeMetadataValue(t.title, 256) ?? null)
            : null,
        createdAt: isoOrNull(t.createdAt),
        updatedAt: isoOrNull(t.updatedAt),
      }));
    } catch (err) {
      console.error("[docs-memory] failed to list threads", err);
      return json({ error: "mastra_unreachable" }, 502);
    }
    return json({ threads });
  }

  if (!THREAD_ID_PATTERN.test(threadId) || threadId.length > MAX_THREAD_ID) {
    return json({ error: "invalid_thread_id" }, 400);
  }

  // Ownership check: the thread must belong to this visitor (resourceId).
  let owned:
    | { id: string; title?: string | null; updatedAt?: unknown; createdAt?: unknown }
    | undefined;
  try {
    const t = await mastra
      .getMemoryThread({ threadId, agentId: DOCS_AGENT_ID })
      .get();
    if (!t || (t as { resourceId?: string }).resourceId !== visitorId) {
      return json({ error: "thread_not_found" }, 404);
    }
    owned = t as NonNullable<typeof owned>;
  } catch (err) {
    if (isHttpStatus(err) && err.status === 404) {
      return json({ error: "thread_not_found" }, 404);
    }
    console.error("[docs-memory] failed to read thread", err);
    return json({ error: "mastra_unreachable" }, 502);
  }

  let rawMessages: unknown[] = [];
  try {
    const thread = mastra.getMemoryThread({ threadId: owned.id, agentId: DOCS_AGENT_ID });
    const result = await thread.listMessages({
      page: 0,
      perPage: MESSAGE_LIMIT,
      orderBy: { field: "createdAt", direction: "ASC" },
    });
    rawMessages = Array.isArray(result.messages) ? result.messages : [];
  } catch (err) {
    console.error("[docs-memory] failed to load messages", err);
    return json({ error: "mastra_unreachable" }, 502);
  }

  const messages = (rawMessages as MastraMessage[])
    .map(toUIMessage)
    .filter((m): m is UIMessage => m !== null);

  return json({
    thread: {
      id: owned.id,
      title:
        typeof owned.title === "string" && owned.title.trim()
          ? sanitizeMetadataValue(owned.title, 256)
          : null,
      updatedAt:
        typeof owned.updatedAt === "string"
          ? owned.updatedAt
          : owned.updatedAt != null
            ? String(owned.updatedAt)
            : null,
    },
    messages,
  });
}
