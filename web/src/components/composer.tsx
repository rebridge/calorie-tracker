import { ArrowUp, LoaderCircle } from "lucide-react";
import { useLayoutEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { AddBurnedChip } from "@/components/add-burned-chip";
import { AddWeightChip } from "@/components/add-weight-chip";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useCreateEntry } from "@/hooks/use-day";
import { ApiError } from "@/lib/api";

function failureMessage(err: Error) {
  if (err instanceof ApiError && err.status === 422) return `That doesn't look like food: ${err.message}`;
  // 502 (model refused, errored or returned junk), network errors, anything else.
  return "Couldn't estimate that — try again";
}

/** Meal text input pinned above the tab bar. Shared by the Log and Day pages. */
export function Composer() {
  const [text, setText] = useState("");
  const textarea = useRef<HTMLTextAreaElement>(null);
  const createEntry = useCreateEntry();
  // isPending only updates on the next render, so a fast double tap could slip past it.
  const inFlight = useRef(false);
  const canSubmit = text.trim().length > 0 && !createEntry.isPending;

  // Auto-grow for browsers without `field-sizing: content` (older iOS Safari).
  useLayoutEffect(() => {
    const el = textarea.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight + el.offsetHeight - el.clientHeight}px`;
  }, [text]);

  function submit() {
    if (!canSubmit || inFlight.current) return;
    inFlight.current = true;
    // On failure the text stays in the box so nothing the user typed is lost.
    createEntry.mutate(
      { text },
      {
        onSuccess: () => setText(""),
        onError: (err) => toast.error(failureMessage(err)),
        onSettled: () => {
          inFlight.current = false;
        },
      },
    );
  }

  return (
    <form
      className="sticky bottom-[calc(3.5rem+env(safe-area-inset-bottom))] -mx-4 -mb-4 mt-4 border-t bg-background/90 px-4 py-3 backdrop-blur"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      {/* Quick-action chips above the input; hidden while empty. */}
      <div className="mb-2 flex gap-2 empty:hidden">
        <AddBurnedChip />

        <AddWeightChip />
      </div>
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
        <Button
          type="submit"
          size="icon"
          className="size-11 rounded-full"
          disabled={!canSubmit}
          aria-label={createEntry.isPending ? "Estimating…" : "Log meal"}
        >
          {createEntry.isPending ? <LoaderCircle className="size-5 animate-spin" /> : <ArrowUp className="size-5" />}
        </Button>
      </div>
    </form>
  );
}
