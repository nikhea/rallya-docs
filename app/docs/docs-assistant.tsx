"use client";

import { AssistantRuntimeProvider } from "@assistant-ui/react";
import { AssistantChatTransport, useChatRuntime } from "@assistant-ui/ai-sdk";

import { AssistantModal } from "@/components/assistant-ui/elements/assistant-modal.aui";

const DOCS_CHAT_URL =
  process.env.NEXT_PUBLIC_DOCS_CHAT_URL ?? "http://localhost:4111/docs-chat";
// Static resource id the anonymous docs assistant reports to Mastra Memory.
// Shared across visitors on purpose (see plan/ai-assistan.md).
const RESOURCE_ID = process.env.NEXT_PUBLIC_DOCS_RESOURCE_ID ?? "docs-visitor";

/**
 * Floating "Ask AI" assistant for the docs. Talks directly to the Mastra
 * docs agent's public, unauthenticated `POST /docs-chat` route (AI SDK v7
 * UI-message SSE).
 *
 * Threading: `useChatRuntime` owns an in-memory thread list, so every page
 * load starts with a fresh runtime thread and `memory.thread` below is a new
 * id per visit — nothing is persisted across reloads. The shared
 * `memory.resource` partitions the (anonymous) usage in Mastra Memory.
 */
export function DocsAssistant() {
  const runtime = useChatRuntime({
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
          memory: { thread: options.id, resource: RESOURCE_ID },
        },
      }),
    }),
  });

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <AssistantModal />
    </AssistantRuntimeProvider>
  );
}
