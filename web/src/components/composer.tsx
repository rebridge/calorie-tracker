import { formatShortDate, MEAL_TYPES, type CreateEntryRequest, type MealType } from "@calorie-tracker/shared";
import { ArrowUp, LoaderCircle } from "lucide-react";
import { useLayoutEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { AddBurnedChip } from "@/components/add-burned-chip";
import { AddWeightChip } from "@/components/add-weight-chip";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useCreateEntry, useDay, useIsEstimating } from "@/hooks/use-day";
import { ApiError } from "@/lib/api";
import { mealLabels } from "@/lib/meals";

function failureMessage(err: Error) {
  if (err instanceof ApiError && err.status === 422) return `That doesn't look like food: ${err.message}`;
  // 502 (model refused, errored or returned junk), network errors, anything else.
  return "Couldn't estimate that — try again";
}

/**
 * Meal text input pinned above the tab bar. Shared by the Log and Day pages.
 * `date` is the day everything is saved to: "today" (the default; the server decides what that is) or a YYYY-MM-DD.
 * A past day also gets meal-type chips, since the time-of-day fallback only applies to today.
 */
export function Composer({ date = "today" }: { date?: string }) {
  const [text, setText] = useState("");
  const [mealType, setMealType] = useState<MealType | null>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const createEntry = useCreateEntry();
  const todayDate = useDay("today").data?.date;
  // Today's submissions carry no date; the server fills it in from `TZ`.
  const pastDate = date !== "today" && date !== todayDate ? date : undefined;
  // Also true for a submission to this day that started before the composer was remounted.
  const estimating = useIsEstimating(pastDate);
  // The mutation's state only updates on the next render, so a fast double tap could slip past it.
  const inFlight = useRef(false);
  const canSubmit = text.trim().length > 0 && !estimating;
  const placeholder = pastDate ? `Add to ${formatShortDate(pastDate, todayDate ?? pastDate)}…` : "What did you eat?";

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
    const body: CreateEntryRequest = { text };
    if (pastDate) {
      body.date = pastDate;
      if (mealType) body.meal_type = mealType;
    }
    // On failure the text (and chosen meal) stay put so nothing the user typed is lost.
    createEntry.mutate(body, {
      onSuccess: () => {
        setText("");
        setMealType(null);
      },
      onError: (err) => toast.error(failureMessage(err)),
      onSettled: () => {
        inFlight.current = false;
      },
    });
  }

  return (
    <form
      className="sticky bottom-(--tabbar-h) -mx-4 -mb-4 mt-4 border-t bg-background/90 px-4 py-3 backdrop-blur"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      {/* Quick-action chips above the input; hidden while empty. */}
      <div className="mb-2 flex gap-2 empty:hidden">
        <AddBurnedChip date={pastDate} />

        <AddWeightChip date={date} />
      </div>
      {pastDate && (
        // Tap to pick a meal, tap again to clear it; unpicked, the model's guess (or snack) is used.
        <div role="group" aria-label="Meal type" className="mb-2 flex gap-2">
          {MEAL_TYPES.map((meal) => (
            <Button
              key={meal}
              type="button"
              variant={mealType === meal ? "default" : "outline"}
              aria-pressed={mealType === meal}
              className="h-11 flex-1 rounded-full px-2"
              onClick={() => setMealType(mealType === meal ? null : meal)}
            >
              {mealLabels[meal]}
            </Button>
          ))}
        </div>
      )}
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
          placeholder={placeholder}
          aria-label={placeholder}
          enterKeyHint="enter"
          className="max-h-40 min-h-11 resize-none"
        />
        <Button
          type="submit"
          size="icon"
          className="size-11 rounded-full"
          disabled={!canSubmit}
          aria-label={estimating ? "Estimating…" : "Log meal"}
          // Keep focus in the textarea when tapping send, so the keyboard doesn't collapse (and the layout jump) before the tap lands.
          onMouseDown={(e) => e.preventDefault()}
        >
          {estimating ? <LoaderCircle className="size-5 animate-spin" /> : <ArrowUp className="size-5" />}
        </Button>
      </div>
    </form>
  );
}
