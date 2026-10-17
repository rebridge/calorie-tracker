import { ArrowUp } from "lucide-react";
import { useLayoutEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useCreateEntry } from "@/hooks/use-day";

/** Meal text input pinned above the tab bar. Shared by the Log and Day pages. */
export function Composer() {
  const [text, setText] = useState("");
  const textarea = useRef<HTMLTextAreaElement>(null);
  const createEntry = useCreateEntry();
  const canSubmit = text.trim().length > 0 && !createEntry.isPending;

  // Auto-grow for browsers without `field-sizing: content` (older iOS Safari).
  useLayoutEffect(() => {
    const el = textarea.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight + el.offsetHeight - el.clientHeight}px`;
  }, [text]);

  function submit() {
    if (!canSubmit) return;
    createEntry.mutate({ text }, { onSuccess: () => setText("") });
  }

  return (
    <form
      className="sticky bottom-[calc(3.5rem+env(safe-area-inset-bottom))] -mx-4 -mb-4 mt-4 border-t bg-background/90 px-4 py-3 backdrop-blur"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <div className="flex items-end gap-2">
        <Textarea
          ref={textarea}
          rows={1}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            // Enter inserts a newline (phone keyboards); ⌘/Ctrl+Enter submits on desktop.
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder="What did you eat?"
          aria-label="What did you eat?"
          enterKeyHint="enter"
          className="max-h-40 min-h-11 resize-none"
        />
        <Button type="submit" size="icon" className="size-11 rounded-full" disabled={!canSubmit} aria-label="Log meal">
          <ArrowUp className="size-5" />
        </Button>
      </div>
      {createEntry.isError && (
        <p className="mt-2 text-sm text-destructive" role="alert">
          {createEntry.error.message}
        </p>
      )}
    </form>
  );
}
