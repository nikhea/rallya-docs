"use client";

import { useState, type FC, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2Icon, MessageSquareIcon } from "lucide-react";

import { ThreadListSearch } from "@/components/assistant-ui/elements/thread-list.aui";
import { getOrCreateVisitorId } from "@/lib/visitor";
import { cn } from "@/lib/utils";

/**
 * Server-driven history for the docs panel: lists the visitor's previous
 * Mastra memory threads (via /api/docs-memory, scoped by `resourceId` =
 * visitorId) and loads one on selection. Rendered inside
 * AssistantRuntimeProvider (it can rely on the same provider context as the
 * thread itself; data fetching here is independent of the in-memory runtime
 * thread list).
 */
type HistoryThread = {
  id: string;
  title: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

const fetchThreads = async (visitorId: string): Promise<HistoryThread[]> => {
  const res = await fetch(`/api/docs-memory?visitorId=${encodeURIComponent(visitorId)}`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`docs-memory list responded ${res.status}`);
  const data = (await res.json()) as { threads?: HistoryThread[] };
  return data.threads ?? [];
};

const dayLabel = (iso: string | null) => {
  if (!iso) return "Earlier";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Earlier";
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfYesterday = new Date(startOfToday);
  startOfYesterday.setDate(startOfToday.getDate() - 1);
  const ts = d.getTime();
  if (ts >= startOfToday.getTime()) return "Today";
  if (ts >= startOfYesterday.getTime()) return "Yesterday";
  return "Earlier";
};

const timeLabel = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
};

export const ThreadHistoryList: FC<{
  onSelectThread: (id: string) => void;
  activeThreadId?: string | undefined;
}> = ({ onSelectThread, activeThreadId }) => {
  const visitorId =
    typeof window !== "undefined" ? getOrCreateVisitorId() : "";
  const [search, setSearch] = useState("");

  const { data, isFetching, isError, refetch } = useQuery({
    queryKey: ["docs-memory-threads", visitorId],
    queryFn: () => fetchThreads(visitorId),
    enabled: visitorId.length > 0,
    staleTime: 5_000,
  });

  const threads = useMemo(() => data ?? [], [data]);
  const query = search.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      query
        ? threads.filter((t) =>
            (t.title ?? "New chat").toLowerCase().includes(query),
          )
        : threads,
    [threads, query],
  );

  const groups = useMemo(() => {
    const out: { label: string; items: HistoryThread[] }[] = [];
    for (const item of filtered) {
      const label = dayLabel(item.updatedAt);
      const last = out[out.length - 1];
      if (last?.label === label) last.items.push(item);
      else out.push({ label, items: [item] });
    }
    return out;
  }, [filtered]);

  const empty = !isFetching && threads.length === 0;

  return (
    <div
      data-slot="aui_thread-history"
      className="aui-modal-thread-list bg-popover absolute inset-0 overflow-y-auto p-2"
    >
      {isFetching && threads.length === 0 && (
        <div className="text-muted-foreground flex h-24 items-center justify-center">
          <Loader2Icon className="size-4 animate-spin" />
        </div>
      )}
      {isError && (
        <div className="flex flex-col items-center gap-2 px-4 py-8 text-center text-xs">
          <p className="text-muted-foreground">Couldn’t load previous conversations.</p>
          <button
            type="button"
            onClick={() => refetch()}
            className="underline underline-offset-2"
          >
            Try again
          </button>
        </div>
      )}
      {threads.length > 0 && (
        <ThreadListSearch value={search} onValueChange={setSearch} />
      )}
      {empty && (
        <p className="text-muted-foreground px-2.5 py-6 text-center text-xs">
          No previous conversations yet — ask the assistant something to get
          started.
        </p>
      )}
      {empty === false && groups.map((group) => (
        <div key={group.label} className="mb-1">
          <div
            data-slot="aui_thread-history-group"
            className="text-muted-foreground px-2.5 pt-3 pb-1 text-xs font-medium"
          >
            {group.label}
          </div>
          {group.items.map((thread) => {
            const active = thread.id === activeThreadId;
            return (
              <button
                key={thread.id}
                type="button"
                data-slot="aui_thread-history-item"
                aria-current={active ? "true" : undefined}
                onClick={() => onSelectThread(thread.id)}
                className={cn(
                  "hover:bg-muted focus-visible:bg-muted flex w-full flex-col items-start gap-0.5 rounded-md px-2.5 py-1.5 text-start outline-none focus-visible:ring-1 focus-visible:ring-foreground/20",
                  active && "bg-muted",
                )}
              >
                <span className="w-full truncate text-[13px] leading-5">
                  {thread.title?.trim() || "New chat"}
                </span>
                <span className="text-muted-foreground flex w-full items-center justify-between text-[11px] leading-4">
                  <span className="inline-flex items-center gap-1.5">
                    <MessageSquareIcon className="size-3" />
                    Conversation
                  </span>
                  <span>{timeLabel(thread.updatedAt)}</span>
                </span>
              </button>
            );
          })}
        </div>
      ))}
      {query && filtered.length === 0 && (
        <p className="text-muted-foreground px-2.5 py-4 text-center text-xs">
          No threads found
        </p>
      )}
    </div>
  );
};
