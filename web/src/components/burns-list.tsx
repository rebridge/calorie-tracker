import type { Burn, DayResponse } from "@calorie-tracker/shared";
import { useState } from "react";
import { BurnDrawer } from "@/components/burn-drawer";
import { fmt } from "@/lib/meals";

/** The day's burn entries with their total. Tap one to edit or delete it. Renders nothing when there are none. */
export function BurnsList({ day }: { day: DayResponse }) {
  if (day.burns.length === 0) return null;

  return (
    <section aria-labelledby="burned-heading">
      <div className="mb-2 flex items-baseline justify-between">
        <h2 id="burned-heading" className="font-semibold">
          Burned
        </h2>
        <span className="text-sm text-muted-foreground tabular-nums">{fmt(day.totals.burned_kcal)} kcal</span>
      </div>
      <ul className="divide-y rounded-xl border bg-card px-4 text-card-foreground shadow-xs">
        {day.burns.map((burn) => (
          <BurnRow key={burn.id} burn={burn} />
        ))}
      </ul>
    </section>
  );
}

function BurnRow({ burn }: { burn: Burn }) {
  const [editing, setEditing] = useState(false);

  return (
    <li>
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="flex min-h-11 w-full items-center justify-between gap-3 py-3 text-left outline-none focus-visible:rounded-md focus-visible:ring-[3px] focus-visible:ring-ring/50"
        aria-label={`Edit ${fmt(burn.calories)} kcal burn${burn.note ? `, ${burn.note}` : ""}`}
      >
        <span className="min-w-0 truncate text-sm text-muted-foreground">{burn.note ?? "No note"}</span>
        <span className="shrink-0 tabular-nums">{fmt(burn.calories)} kcal</span>
      </button>
      <BurnDrawer burn={burn} open={editing} onOpenChange={setEditing} />
    </li>
  );
}
