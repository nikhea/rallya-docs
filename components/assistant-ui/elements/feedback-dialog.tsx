"use client";

import { useId, type ComponentProps } from "react";
import { CheckIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  field,
  inkButton,
  mono,
  paper,
  pressable,
} from "@/components/assistant-ui/elements/surfaces";

/**
 * Thumbs-down that asks why, so the signal arrives with a reason attached.
 *
 * Vendored (not registry-installed): the assistant-ui registry does not ship a
 * pullable `feedback-dialog` item. Mirrors the documented contract:
 *
 * - `reasons` — the reason pills offered; toggle independently (multi-select,
 *   `aria-pressed`, no minimum).
 * - `selected` / `note` / `sent` — controlled state owned by the caller.
 * - `onSubmit` — called with no arguments; read `selected`/`note` from your
 *   own state. The submit button renders only when this is supplied.
 * - Without `onToggleReason`, pills render as non-interactive selected-state
 *   chips. The live region (`role="status"`) is mounted in both states so a
 *   screen reader announces the confirmation the moment it appears.
 */
export type FeedbackDialogProps = {
  reasons: readonly string[];
  selected: readonly string[];
  note: string;
  sent: boolean;
  onToggleReason?: ((reason: string) => void) | undefined;
  onNoteChange?: ((note: string) => void) | undefined;
  onSubmit?: (() => void) | undefined;
  className?: string | undefined;
} & Omit<ComponentProps<"div">, "children" | "onSubmit">;

export function FeedbackDialog({
  reasons,
  selected,
  note,
  sent,
  onToggleReason,
  onNoteChange,
  onSubmit,
  className,
  ...props
}: FeedbackDialogProps) {
  const noteId = useId();

  return (
    <div
      data-slot="feedback-dialog"
      className={cn(
        paper,
        "w-full max-w-md rounded-xl p-3 text-sm",
        className,
      )}
      {...props}
    >
      {/* Always mounted so assistive tech announces the state change. */}
      <div role="status" aria-live="polite">
        {sent && (
          <p className="text-foreground flex items-center gap-2">
            <CheckIcon className="text-emerald-600 dark:text-emerald-400 size-4" />
            Thanks — your feedback was sent.
          </p>
        )}
      </div>

      {!sent && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit?.();
          }}
        >
          <p className={cn(mono, "text-muted-foreground")}>
            What went wrong?
          </p>

          <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="Reasons it was unhelpful">
            {reasons.map((reason) => {
              const active = selected.includes(reason);
              const interactive = onToggleReason !== undefined;
              return (
                <button
                  key={reason}
                  type="button"
                  aria-pressed={active}
                  disabled={!interactive}
                  onClick={() => onToggleReason?.(reason)}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs transition-colors",
                    active
                      ? "border-transparent bg-foreground text-background"
                      : "border-border/60 text-muted-foreground",
                    interactive &&
                      !active &&
                      "hover:border-border hover:text-foreground",
                    !interactive && "cursor-default",
                  )}
                >
                  {reason}
                </button>
              );
            })}
          </div>

          {/* The comment box — visible label, always present. */}
          <label
            htmlFor={noteId}
            className="text-muted-foreground mt-2.5 block text-xs font-medium"
          >
            Comment <span className="font-normal">(optional)</span>
          </label>
          <textarea
            id={noteId}
            value={note}
            rows={2}
            disabled={onNoteChange === undefined}
            placeholder="What should the docs say instead? Anything else we should know…"
            onChange={(event) => onNoteChange?.(event.target.value)}
            className={cn(
              field,
              "border-border/50 placeholder:text-muted-foreground/70 mt-1 block w-full resize-y rounded-lg border px-3 py-2 text-sm leading-relaxed outline-none focus-visible:ring-1 focus-visible:ring-foreground/20",
            )}
          />

          {onSubmit && (
            <div className="mt-2.5 flex items-center justify-end">
              <button
                type="submit"
                className={cn(
                  inkButton,
                  pressable,
                  "rounded-full px-4 py-1.5 text-xs font-medium",
                )}
              >
                Send feedback
              </button>
            </div>
          )}
        </form>
      )}
    </div>
  );
}
