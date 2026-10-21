import type { DayResponse, Entry, EntryItem, MealType } from "@calorie-tracker/shared";
import { Skeleton } from "@/components/ui/skeleton";

const mealLabels: Record<MealType, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  snack: "Snack",
};

const fmt = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 1 });

const timeOf = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

/**
 * A day's entries grouped by meal. Shared by the Log and Day pages.
 * `pending` shows a placeholder card while a new entry is being estimated.
 */
export function MealLog({ day, pending = false }: { day: DayResponse; pending?: boolean }) {
  const meals = day.meals.filter((m) => m.entries.length > 0);
  if (meals.length === 0 && !pending) {
    return <p className="py-12 text-center text-muted-foreground">Nothing logged</p>;
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
        <span className="shrink-0 font-semibold tabular-nums">{fmt(entry.calories)} kcal</span>
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
  return (
    <li className="flex min-h-11 items-center justify-between gap-3 py-2">
      <div className="min-w-0">
        <p className="truncate">{item.name}</p>
        <p className="truncate text-sm text-muted-foreground">{item.portion}</p>
        <p className="text-xs text-muted-foreground tabular-nums">
          P {fmt(item.protein_g)}g · C {fmt(item.carbs_g)}g · F {fmt(item.fat_g)}g
        </p>
      </div>
      <span className="shrink-0 tabular-nums">{fmt(item.calories)}</span>
    </li>
  );
}
