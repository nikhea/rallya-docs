"use client";

import { useCallback } from "react";
import { useAuiEvent } from "@assistant-ui/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { usePathname } from "next/navigation";

import { buildThreadMetadata, getOrCreateVisitorId } from "@/lib/visitor";
import type { ThreadMetadata } from "@/lib/thread-metadata";

/**
 * Syncs the anonymous visitor's attribution metadata onto the Mastra memory
 * thread after every run ends (fires for completed, errored, and cancelled
 * runs). The write goes through the same-origin /api/docs-visitor-meta route;
 * the route attaches the visitor IP and upserts onto the thread.
 *
 * Best-effort by design: failures are logged and swallowed — chat never
 * depends on this. Rendered inside AssistantRuntimeProvider.
 */
export function ThreadMetaSync() {
  const pathname = usePathname();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async ({
      threadId,
      metadata,
    }: {
      threadId: string;
      metadata: ThreadMetadata;
    }) => {
      const res = await fetch("/api/docs-visitor-meta", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ threadId, metadata }),
      });
      if (!res.ok) {
        throw new Error(`docs-visitor-meta responded ${res.status}`);
      }
      return (await res.json()) as { ok: boolean };
    },
    retry: 2,
    onError: (error) => {
      console.warn("[docs] anonymous visitor metadata sync failed", error);
    },
  });

  const sync = useCallback(
    ({ threadId }: { threadId: string }) => {
      // Keep the History list fresh after every run.
      const visitorId = getOrCreateVisitorId();
      if (visitorId) {
        queryClient.invalidateQueries({
          queryKey: ["docs-memory-threads", visitorId],
        });
      }
      mutation.mutate({ threadId, metadata: buildThreadMetadata(pathname) });
    },
    [mutation, pathname, queryClient],
  );

  useAuiEvent("thread.runEnd", sync);

  return null;
}
