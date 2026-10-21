import { progressPercent, remainingKcal, type DayResponse } from "@calorie-tracker/shared";
import { cn } from "@/lib/utils";
import { fmt } from "@/lib/meals";

/** Remaining calories for the day, with Eaten / Burned / Goal underneath. Over budget is red and says so. */
export function HeaderCard({ day }: { day: DayResponse }) {
  const { goals, totals } = day;
  const remaining = remainingKcal({ goal: goals.calorie_goal, eaten: totals.eaten_kcal, burned: totals.burned_kcal });
  const over = remaining < 0;

  return (
    <section
      aria-label="Calorie budget"
      className={cn(
        "rounded-xl border bg-card p-4 text-card-foreground shadow-xs",
        over && "border-destructive/50 bg-destructive/5",
      )}
    >
      <p className={cn("text-sm font-medium text-muted-foreground", over && "text-destructive")}>
        {over ? "Over budget" : "Remaining"}
      </p>
      <p
        className={cn("mt-1 flex items-baseline gap-2 tabular-nums", over && "text-destructive")}
        data-over-budget={over || undefined}
      >
        <span className="text-5xl leading-none font-bold">{fmt(remaining)}</span>
        <span className="text-sm font-medium text-muted-foreground">kcal</span>
      </p>
      <dl className="mt-4 grid grid-cols-3 gap-2 border-t pt-3 text-center">
        <Stat label="Eaten" value={totals.eaten_kcal} />
        <Stat label="Burned" value={totals.burned_kcal} />
        <Stat label="Goal" value={goals.calorie_goal} />
      </dl>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-lg font-semibold tabular-nums">{fmt(value)}</dd>
    </div>
  );
}

/** Protein, carbs and fat in grams against their goals. */
export function MacroBars({ day }: { day: DayResponse }) {
  const { goals, totals } = day;
  const macros = [
    { label: "Protein", value: totals.protein_g, goal: goals.protein_goal_g },
    { label: "Carbs", value: totals.carbs_g, goal: goals.carbs_goal_g },
    { label: "Fat", value: totals.fat_g, goal: goals.fat_goal_g },
  ];

  return (
    <section aria-label="Macros" className="space-y-3 rounded-xl border bg-card p-4 text-card-foreground shadow-xs">
      {macros.map((m) => (
        <MacroBar key={m.label} {...m} />
      ))}
    </section>
  );
}

function MacroBar({ label, value, goal }: { label: string; value: number; goal: number }) {
  const over = value > goal;
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between text-sm">
        <span className="font-medium">{label}</span>
        <span className={cn("text-muted-foreground tabular-nums", over && "font-medium text-amber-700 dark:text-amber-400")}>
          {fmt(value)} / {fmt(goal)} g
        </span>
      </div>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={goal}
        aria-valuenow={Math.min(value, goal)}
        aria-valuetext={`${fmt(value)} of ${fmt(goal)} grams`}
        className="h-2.5 overflow-hidden rounded-full bg-muted"
      >
        {/* The bar stops at 100%; the label above keeps the real number. */}
        <div
          className={cn("h-full rounded-full bg-primary transition-[width]", over && "bg-amber-500")}
          style={{ width: `${progressPercent(value, goal)}%` }}
        />
      </div>
    </div>
  );
}
