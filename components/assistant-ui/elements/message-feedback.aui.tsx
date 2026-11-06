"use client";

import { useState, type FC } from "react";
import { useAui } from "@assistant-ui/react";

import { FeedbackDialog } from "@/components/assistant-ui/elements/feedback-dialog";

/**
 * The thumbs-down follow-up: "What went wrong?" — reason pills and an
 * optional comment, sent as `comment` on `aui.message.submitFeedback`.
 * Rendered below the action bar for the message it targets; unmounts on
 * dismiss/close, so reopening always starts a fresh form.
 */
const DOCS_FEEDBACK_REASONS = [
  "Not factual",
  "Didn't answer my question",
  "Missing or wrong sources",
  "Too long",
  "Off topic",
] as const;

export const MessageFeedbackPanel: FC<{ onClose: () => void }> = ({
  onClose,
}) => {
  const aui = useAui();
  const [selected, setSelected] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [sent, setSent] = useState(false);

  const toggleReason = (reason: string) =>
    setSelected((current) =>
      current.includes(reason)
        ? current.filter((item) => item !== reason)
        : [...current, reason],
    );

  const submit = () => {
    const comment = [...selected, note.trim()]
      .filter(Boolean)
      .join(". ")
      .slice(0, 1000);
    aui.message.submitFeedback({ type: "negative", comment });
    setSent(true);
  };

  return (
    <div
      data-slot="aui_message-feedback"
      className="mb-1 flex flex-col items-start gap-1.5 pt-1"
    >
      <FeedbackDialog
        reasons={DOCS_FEEDBACK_REASONS}
        selected={selected}
        note={note}
        sent={sent}
        onToggleReason={toggleReason}
        onNoteChange={setNote}
        onSubmit={submit}
      />
      <button
        type="button"
        onClick={onClose}
        className="text-muted-foreground hover:text-foreground px-1 text-xs underline underline-offset-2"
      >
        {sent ? "Close" : "Dismiss"}
      </button>
    </div>
  );
};
