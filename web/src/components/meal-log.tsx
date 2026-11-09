import type { DayResponse, Entry, EntryItem } from "@calorie-tracker/shared";
import { useState } from "react";
import { EntryMenu } from "@/components/entry-menu";
import { ItemEditDrawer } from "@/components/item-edit-drawer";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { fmt, mealLabels } from "@/lib/meals";

const timeOf = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

/**
 * A day's entries grouped by meal. Shared by the Log and Day pages.
 * `pending` shows a placeholder card while a new entry is being estimated.
 */
export function MealLog({ day, pending = false }: { day: DayResponse; pending?: boolean }) {
  const meals = day.meals.filter((m) => m.entries.length > 0);
  if (meals.length === 0 && !pending) {
    // A day with only a burn or a weight isn't empty; say what's actually missing.
    const hasOtherData = day.burns.length > 0 || day.weight !== null;
    return <p className="py-12 text-center text-muted-foreground">{hasOtherData ? "No meals logged" : "Nothing logged"}</p>;
  }

  return (
    <div className="space-y-6">
      {pending && <EntrySkeleton />}
      {meals.map((meal) => (
        <section key={meal.meal_type} aria-labelledby={`meal-${meal.meal_type}`}>
          <div className="mb-2 flex items-baseline justify-between">
            <h2 id={`meal-${meal.meal_type}`} className="font-semibold">
              {mealLabels[meal.meal_type]}
            </h2>
            <span className="text-sm text-muted-foreground tabular-nums">{fmt(meal.calories)} kcal</span>
          </div>
          <div className="space-y-3">
            {meal.entries.map((entry) => (
              <EntryCard key={entry.id} entry={entry} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function EntryCard({ entry }: { entry: Entry }) {
  return (
    <article className="rounded-xl border bg-card text-card-foreground shadow-xs">
      <header className="flex items-start justify-between gap-3 px-4 pt-3">
        <div className="min-w-0">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            {mealLabels[entry.meal_type]} · {timeOf(entry.created_at)}
          </p>
          <p className="mt-0.5 text-sm text-muted-foreground italic">{entry.raw_text}</p>
        </div>
        <div className="flex shrink-0 items-start gap-1">
          <span className="font-semibold tabular-nums">{fmt(entry.calories)} kcal</span>
          <EntryMenu entry={entry} />
        </div>
      </header>
      <ul className="divide-y px-4 pb-1">
        {entry.items.map((item) => (
          <ItemRow key={item.id} item={item} />
        ))}
      </ul>
    </article>
  );
}

function EntrySkeleton() {
  return (
    <article className="rounded-xl border bg-card shadow-xs" aria-busy="true" aria-label="Estimating your meal">
      <header className="flex items-start justify-between gap-3 px-4 pt-3">
        <div className="flex-1 space-y-2">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-4 w-3/4" />
        </div>
        <Skeleton className="h-5 w-16" />
      </header>
      <ul className="divide-y px-4 pb-1">
        {[0, 1].map((i) => (
          <li key={i} className="flex min-h-11 items-center justify-between gap-3 py-3">
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-3 w-1/3" />
            </div>
            <Skeleton className="h-4 w-10" />
          </li>
        ))}
      </ul>
    </article>
  );
}

function ItemRow({ item }: { item: EntryItem }) {
  const [editing, setEditing] = useState(false);

  return (
    // The row button stretches over the whole <li> (after:inset-0); the badge sits above it (z-10) so it stays tappable.
    // `isolate` keeps that z-10 inside the row, so the badge scrolls under the sticky header, date bar and composer.
    <li className="relative isolate flex min-h-11 items-center justify-between gap-2 py-2">
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="min-w-0 flex-1 text-left outline-none after:absolute after:inset-0 focus-visible:after:rounded-md focus-visible:after:ring-[3px] focus-visible:after:ring-ring/50"
        aria-label={`Edit ${item.name}`}
      >
        <p className="flex items-baseline gap-2">
          <span className="truncate">{item.name}</span>
          {item.edited && <span className="shrink-0 text-xs text-muted-foreground italic">edited</span>}
        </p>
        <p className="truncate text-sm text-muted-foreground">{item.portion}</p>
        <p className="text-xs text-muted-foreground tabular-nums">
          P {fmt(item.protein_g)}g · C {fmt(item.carbs_g)}g · F {fmt(item.fat_g)}g
        </p>
      </button>
      {item.confidence === "low" && <LowConfidenceBadge assumption={item.assumption} />}
      <span className="shrink-0 tabular-nums">{fmt(item.calories)}</span>
      <ItemEditDrawer item={item} open={editing} onOpenChange={setEditing} />
    </li>
  );
}

/** Amber "low" badge; tapping it explains the assumption behind the estimate. */
function LowConfidenceBadge({ assumption }: { assumption: string | null }) {
  return (
    <Popover>
      <PopoverTrigger
        aria-label="Why is this a low-confidence estimate?"
        className="relative z-10 -my-2 flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-md outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        <Badge variant="warning">low</Badge>
      </PopoverTrigger>
      <PopoverContent className="text-sm">{assumption ?? "The model wasn't confident in this estimate."}</PopoverContent>
    </Popover>
  );
}
