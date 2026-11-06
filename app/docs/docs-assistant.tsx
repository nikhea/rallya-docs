"use client";

import { useMemo, useState, useCallback } from "react";

import { AssistantRuntimeProvider, AuiConfig, Suggestions } from "@assistant-ui/react";
import type { FeedbackAdapter } from "@assistant-ui/core";
import { AssistantChatTransport, useChatRuntime } from "@assistant-ui/ai-sdk";
import type { UIMessage } from "ai";
import { useMutation, useQuery } from "@tanstack/react-query";

import { AssistantModal } from "@/components/assistant-ui/elements/assistant-modal.aui";
import { ThreadMetaSync } from "@/app/docs/thread-meta-sync";
import { getOrCreateVisitorId } from "@/lib/visitor";

const DOCS_CHAT_URL =
  process.env.NEXT_PUBLIC_DOCS_CHAT_URL ?? "http://localhost:4111/docs-chat";

type DocsThreadSnapshot = {
  thread: { id: string; title: string | null; updatedAt: string | null } | null;
  messages: UIMessage[];
};

/**
 * The `traceId` for a message, read defensively: assistant-ui moves unknown
 * metadata keys to `metadata.custom`, but fall back to a top-level
 * `metadata.traceId` in case that mapping ever changes.
 */
type AdapterMessage = Parameters<FeedbackAdapter["submit"]>[0]["message"];
const getTraceId = (message: AdapterMessage): string | undefined => {
  const metadata = message.metadata as
    | { custom?: unknown; traceId?: unknown }
    | undefined;
  const custom = metadata?.custom;
  const nested =
    custom && typeof custom === "object" && !Array.isArray(custom)
      ? (custom as Record<string, unknown>).traceId
      : undefined;
  const candidate = nested ?? metadata?.traceId;
  return typeof candidate === "string" && candidate ? candidate : undefined;
};

const fetchThread = async (
  visitorId: string,
  threadId: string,
): Promise<DocsThreadSnapshot> => {
  const res = await fetch(
    `/api/docs-memory?visitorId=${encodeURIComponent(visitorId)}&threadId=${encodeURIComponent(threadId)}`,
    { cache: "no-store" },
  );
  if (!res.ok) throw new Error(`docs-memory responded ${res.status}`);
  return (await res.json()) as DocsThreadSnapshot;
};

export function DocsAssistant() {
  const visitorId =
    typeof window !== "undefined" ? getOrCreateVisitorId() : "";
  // undefined → fresh chat on every page load (asked for); set → continue the
  // selected previous thread (seeded from Mastra).
  const [activeThreadId, setActiveThreadId] = useState<string | undefined>(undefined);

  const selectThread = useCallback((id: string) => setActiveThreadId(id), []);
  const newThread = useCallback(() => setActiveThreadId(undefined), []);

  const { data: selected, isLoading, isError } = useQuery({
    queryKey: ["docs-memory-thread", visitorId, activeThreadId],
    queryFn: () => fetchThread(visitorId, activeThreadId as string),
    enabled: activeThreadId !== undefined && visitorId.length > 0,
    staleTime: Number.POSITIVE_INFINITY,
    retry: 1,
  });

  // While a selected previous conversation loads, render nothing; on failure
  // fall back to a fresh chat instead of blocking.
  if (activeThreadId !== undefined) {
    if (isLoading) return null;
    if (isError) return <ChatSurface key="new" visitorId={visitorId} onSelectThread={selectThread} onNewThread={newThread} />;
  }

  return (
    <ChatSurface
      key={activeThreadId ?? "new"}
      visitorId={visitorId}
      snapshot={selected}
      activeThreadId={activeThreadId}
      onSelectThread={selectThread}
      onNewThread={newThread}
    />
  );
}

const ChatSurface: React.FC<{
  visitorId: string;
  snapshot?: DocsThreadSnapshot | undefined;
  activeThreadId?: string | undefined;
  onSelectThread: (id: string) => void;
  onNewThread: () => void;
}> = ({ visitorId, snapshot, activeThreadId, onSelectThread, onNewThread }) => {
  // Thumbs feedback on any reply posts to the same-origin /api/docs-feedback
  // proxy (server-held Mastra token). Fire-and-forget via React Query: never
  // blocks or crashes the chat.
  const feedbackMutation = useMutation({
    mutationFn: async (payload: {
      traceId: string;
      type: "positive" | "negative";
      comment?: string;
    }) => {
      const res = await fetch("/api/docs-feedback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...payload,
          visitorId: getOrCreateVisitorId() || undefined,
        }),
      });
      if (!res.ok) throw new Error(`docs-feedback responded ${res.status}`);
    },
    retry: 1,
    onError: (error) => {
      console.warn("[docs] feedback sync failed", error);
    },
  });

  // The runtime flips thread.capabilities.feedback on when this is set, which
  // is what reveals the thumbs buttons on every assistant reply.
  const feedbackAdapter = useMemo<FeedbackAdapter>(
    () => ({
      submit: ({ message, type, comment }) => {
        const traceId = getTraceId(message);
        if (!traceId) {
          console.warn("[docs] feedback skipped: no traceId on message");
          return;
        }
        feedbackMutation.mutate({
          traceId,
          type,
          ...(comment ? { comment } : {}),
        });
      },
    }),
    [feedbackMutation],
  );

  const runtime = useChatRuntime({
    // Seeded thread: keep the same Mastra thread id so new messages continue
    // the restored conversation. Unset: the SDK generates one and Mastra
    // creates the thread lazily on the first message.
    ...(snapshot?.thread?.id ? { id: snapshot.thread.id } : {}),
    ...(snapshot?.messages?.length ? { messages: snapshot.messages } : {}),
    adapters: { feedback: feedbackAdapter },
    transport: new AssistantChatTransport({
      api: DOCS_CHAT_URL,
      prepareSendMessagesRequest: (options) => ({
        // Returning a body REPLACES the transport default — mirror
        // DefaultChatTransport's shape (id/messages/trigger/messageId/
        // metadata) and append Mastra's memory field. Omitting `messages`
        // breaks the stream ("Messages must be an array of UIMessage objects").
        body: {
          ...options.body,
          id: options.id,
          messages: options.messages,
          trigger: options.trigger,
          messageId: options.messageId,
          metadata: options.requestMetadata,
          memory: {
            thread: options.id,
            // Long-lived anonymous id from localStorage; groups this visitor's
            // threads under one Mastra resource. Falls back to the legacy
            // shared id if storage is unavailable.
            resource: visitorId || getOrCreateVisitorId() || "docs-visitor",
          },
        },
      }),
    }),
  });

  // Created once so the provider doesn't see a new config identity per render.
  const config = useMemo(
    () =>
      AuiConfig({
        suggestions: Suggestions([
          "How do I get started?",
          "How do I create an API key?",
          "Which SDKs are available?",
          "How do orders and payments work?",
        ]),
      }),
    [],
  );

  return (
    <AssistantRuntimeProvider runtime={runtime} config={config}>
      <ThreadMetaSync />
      <AssistantModal
        onNewThread={onNewThread}
        onSelectThread={onSelectThread}
        activeThreadId={activeThreadId ?? snapshot?.thread?.id}
      />
    </AssistantRuntimeProvider>
  );
};
