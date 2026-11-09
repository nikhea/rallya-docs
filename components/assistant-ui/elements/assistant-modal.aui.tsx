"use client";

import {
  BookOpenIcon,
  ChevronDownIcon,
  HistoryIcon,
  Loader2Icon,
  PlusIcon,
  XIcon,
} from "lucide-react";

import {
  type ComponentPropsWithoutRef,
  type FC,
  forwardRef,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from "react";
import { useAuiEvent, useAuiState } from "@assistant-ui/react";
import { Popover as PopoverPrimitive } from "@base-ui/react/popover";

import { Thread } from "@/components/assistant-ui/elements/thread.aui";
import { ThreadHistoryList } from "@/app/docs/thread-history";
import { TooltipIconButton } from "@/components/assistant-ui/elements/tooltip-icon-button";

type ModalView = "thread" | "list";

export type AssistantModalProps = PropsWithChildren<{
  /** Panel open state, owned above the runtime so thread switches keep it open. */
  open: boolean;
  onOpenChange: (open: boolean) => void;
}>;

/**
 * Popover shell for the Ask AI panel. The shell intentionally sits *above*
 * the chat runtime/provider: switching conversations remounts the runtime
 * subtree, so anything rendered inside the popup is replaced while the popup
 * element itself stays mounted (no close-then-open flash). The portal is
 * `keepMounted` so closing the panel does not throw away the conversation.
 */
export const AssistantModal: FC<AssistantModalProps> = ({
  open,
  onOpenChange,
  children,
}) => {
  return (
    <PopoverPrimitive.Root
      open={open}
      onOpenChange={(nextOpen, eventDetails) => {
        if (
          !nextOpen &&
          (eventDetails.reason === "outside-press" ||
            eventDetails.reason === "focus-out")
        ) {
          eventDetails.cancel();
        } else {
          onOpenChange(nextOpen);
        }
      }}
    >
      <div className="aui-root aui-modal-anchor fixed end-4 bottom-4 size-11">
        <PopoverPrimitive.Trigger
          render={(props, state) => (
            <AssistantModalButton {...props} open={state.open} />
          )}
        />
      </div>
      <PopoverPrimitive.Portal keepMounted>
        <PopoverPrimitive.Positioner
          positionMethod="fixed"
          // Fill the viewport (small inset) instead of anchoring to the
          // trigger. These styles merge over the floating-ui computed
          // position/transform, so the panel always covers the screen.
          style={{
            top: "0.75rem",
            right: "0.75rem",
            bottom: "0.75rem",
            left: "auto",
            width: "30%",
            transform: "none",
            height: "auto",
          }}
          className="isolate z-50 max-md:left-3! max-md:w-full!"
        >
          <PopoverPrimitive.Popup
            className="group/modal aui-root aui-modal-content bg-popover text-popover-foreground data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 [&[data-open]_.aui-thread-viewport-footer]:animate-in [&[data-open]_.aui-thread-viewport-footer]:fade-in-0 [&[data-open]_.aui-thread-viewport-footer]:slide-in-from-bottom-2 [&[data-open]_.aui-thread-viewport-footer]:fill-mode-backwards [&_.aui-thread-viewport-footer]:bg-popover ring-foreground/10 z-50 flex h-full w-full flex-col gap-0 overflow-clip overscroll-contain rounded-xl p-0 text-base antialiased shadow-[0_16px_48px_-24px_rgb(0_0_0/0.25)] ring-1 transition-none ease-[cubic-bezier(0.32,0.72,0,1)] outline-none data-closed:duration-200 data-open:duration-300 motion-reduce:animate-none dark:shadow-[0_16px_48px_-24px_rgb(0_0_0/0.6)] [&_.aui-thread-root]:bg-inherit motion-reduce:[&_.aui-thread-viewport-footer]:animate-none [&[data-open]_.aui-thread-viewport-footer]:delay-100 [&[data-open]_.aui-thread-viewport-footer]:duration-300 [&[data-open]_.aui-thread-viewport-footer]:ease-[cubic-bezier(0.32,0.72,0,1)]"
          >
            {children}
          </PopoverPrimitive.Popup>
        </PopoverPrimitive.Positioner>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
};

export type AssistantModalPanelProps = {
  /** Start a fresh, empty conversation (used by the + button). */
  onNewThread: () => void;
  /** Open a previous conversation (History list). */
  onSelectThread: (id: string) => void;
  /** Currently open conversation's Mastra thread id, if any. */
  activeThreadId?: string | undefined;
  /** Stored title for the open conversation (shown until the runtime has one). */
  title?: string | undefined;
  onOpenChange: (open: boolean) => void;
};

/**
 * Runtime-dependent panel content: header, thread, and history list. Rendered
 * inside `AssistantModal` so a thread switch only swaps these children.
 */
export const AssistantModalPanel: FC<AssistantModalPanelProps> = ({
  onNewThread,
  onSelectThread,
  activeThreadId,
  title,
  onOpenChange,
}) => {
  const [view, setView] = useState<ModalView>("thread");
  const thread = useMemo(() => <Thread />, []);

  useAuiEvent("thread.runStart", () => {
    setView("thread");
    onOpenChange(true);
  });

  return (
    <>
      <AssistantModalHeader
        view={view}
        onViewChange={setView}
        onNewThread={onNewThread}
        fallbackTitle={title}
      />
      <div className="aui-modal-body relative min-h-0 flex-1">
        <div
          ref={(node) => {
            if (node) node.inert = view === "list";
          }}
          className="aui-modal-thread h-full"
        >
          {thread}
        </div>
        {view === "list" && (
          <ThreadHistoryList
            activeThreadId={activeThreadId}
            onSelectThread={(id) => {
              onSelectThread(id);
              setView("thread");
            }}
          />
        )}
      </div>
    </>
  );
};

/** Placeholder shown while a previous conversation is being fetched. */
export const AssistantModalLoading: FC = () => {
  return (
    <div data-slot="aui-modal-loading" className="flex h-full flex-col">
      <div className="aui-modal-header border-foreground/10 flex h-11 shrink-0 items-center gap-2 border-b ps-3.5 pe-2">
        <span className="aui-modal-title min-w-0 flex-1 truncate text-[13px] font-medium">
          Conversation
        </span>
      </div>
      <div
        role="status"
        aria-live="polite"
        className="text-muted-foreground flex flex-1 items-center justify-center gap-2 text-sm"
      >
        <Loader2Icon className="size-4 animate-spin" aria-hidden />
        <span>Loading conversation…</span>
      </div>
    </div>
  );
};

const AssistantModalHeader: FC<{
  view: ModalView;
  onViewChange: (view: ModalView) => void;
  onNewThread: () => void;
  fallbackTitle?: string | undefined;
}> = ({ view, onViewChange, onNewThread, fallbackTitle }) => {
  const runtimeTitle = useAuiState((s) => s.threadListItem.title);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const shownViewRef = useRef(view);

  useEffect(() => {
    if (shownViewRef.current === view) return;
    shownViewRef.current = view;
    const heading = titleRef.current;
    const active = document.activeElement;
    if (
      active === document.body ||
      active === heading?.closest("[role='dialog']")
    ) {
      heading?.focus();
    }
  }, [view]);

  return (
    <div className="aui-modal-header border-foreground/10 flex h-11 shrink-0 items-center gap-2 border-b ps-3.5 pe-2">
      <PopoverPrimitive.Title
        ref={titleRef}
        tabIndex={-1}
        className="aui-modal-title min-w-0 flex-1 truncate text-[13px] font-medium outline-none"
      >
        {view === "list"
          ? "Threads"
          : runtimeTitle || fallbackTitle || "New Chat"}
      </PopoverPrimitive.Title>
      <div className="flex shrink-0 items-center gap-0.5">
        <TooltipIconButton
          tooltip="Threads"
          side="bottom"
          aria-pressed={view === "list"}
          className="aui-modal-threads text-muted-foreground hover:text-foreground aria-pressed:bg-muted aria-pressed:text-foreground size-7 rounded-md p-0"
          onClick={() => onViewChange(view === "list" ? "thread" : "list")}
        >
          <HistoryIcon className="size-3.5" />
        </TooltipIconButton>
        <TooltipIconButton
          tooltip="New Thread"
          side="bottom"
          data-slot="aui_modal-new-thread"
          className="aui-modal-new text-muted-foreground hover:text-foreground size-7 rounded-md p-0"
          onClick={() => {
            onNewThread();
            onViewChange("thread");
          }}
        >
          <PlusIcon className="size-3.5" />
        </TooltipIconButton>
        <PopoverPrimitive.Close
          render={
            <TooltipIconButton
              tooltip="Close"
              side="bottom"
              className="aui-modal-close text-muted-foreground hover:text-foreground size-7 rounded-md p-0"
            />
          }
        >
          <XIcon className="size-4" />
        </PopoverPrimitive.Close>
      </div>
    </div>
  );
};

type AssistantModalButtonProps = Omit<
  ComponentPropsWithoutRef<typeof TooltipIconButton>,
  "tooltip"
> & {
  open: boolean;
};

const AssistantModalButton = forwardRef<
  HTMLButtonElement,
  AssistantModalButtonProps
>(({ open, ...rest }, ref) => {
  const tooltip = open ? "Close Assistant" : "Open Assistant";

  return (
    <TooltipIconButton
      variant="ghost"
      tooltip={tooltip}
      side="left"
      {...rest}
      className="aui-modal-button bg-background text-foreground border-border/60 hover:border-border hover:bg-background size-full rounded-full border transition-[border-color,scale] duration-150 ease-out active:scale-96 motion-reduce:transition-none"
      ref={ref}
    >
      <BookOpenIcon
        data-open={open ? "" : undefined}
        data-closed={open ? undefined : ""}
        className="aui-modal-button-closed-icon absolute size-5 transition-[scale,opacity,filter] duration-200 ease-[cubic-bezier(0.2,0,0,1)] data-closed:scale-100 data-closed:opacity-100 data-closed:blur-[0px] data-open:scale-25 data-open:opacity-0 data-open:blur-[4px] motion-reduce:transition-none"
      />

      <ChevronDownIcon
        data-open={open ? "" : undefined}
        data-closed={open ? undefined : ""}
        className="aui-modal-button-open-icon absolute size-5 transition-[scale,opacity,filter] duration-200 ease-[cubic-bezier(0.2,0,0,1)] data-closed:scale-25 data-closed:opacity-0 data-closed:blur-[4px] data-open:scale-100 data-open:opacity-100 data-open:blur-[0px] motion-reduce:transition-none"
      />
      <span className="aui-sr-only sr-only">{tooltip}</span>
    </TooltipIconButton>
  );
});

AssistantModalButton.displayName = "AssistantModalButton";
