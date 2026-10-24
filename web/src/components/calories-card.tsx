import { lazy, Suspense } from "react";
import { ErrorBoundary } from "@/components/error-boundary";
import { Skeleton } from "@/components/ui/skeleton";

// Same chunk as the weight chart's Recharts, loaded after the card first shows.
const CalorieTrendChart = lazy(() =>
  import("@/components/calorie-trend-chart").then((m) => ({ default: m.CalorieTrendChart })),
);

/** Each day's net calories against the goal, shown above the weight card. `date` is the viewed day, marked on the chart. */
export function CaloriesCard({ date }: { date: string }) {
  return (
    <section aria-label="Calories vs goal" className="rounded-xl border bg-card p-4 text-card-foreground shadow-xs">
      <h2 className="text-sm font-medium text-muted-foreground">Calories vs goal</h2>
      <ErrorBoundary
        fallback={
          <p role="alert" className="mt-3 text-sm text-destructive">
            Couldn&apos;t load the calories chart. Reload to try again.
          </p>
        }
      >
        <Suspense fallback={<Skeleton className="mt-3 h-72 w-full" />}>
          <CalorieTrendChart date={date} />
        </Suspense>
      </ErrorBoundary>
    </section>
  );
}
