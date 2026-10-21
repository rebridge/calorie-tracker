import { useIsMutating } from "@tanstack/react-query";
import { useParams } from "react-router";
import { BurnsList } from "@/components/burns-list";
import { Composer } from "@/components/composer";
import { HeaderCard, MacroBars } from "@/components/day-summary";
import { MealLog } from "@/components/meal-log";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { createEntryKey, useDay } from "@/hooks/use-day";

/**
 * `/day/:date?`. Only today is used for now (no date param = today); date navigation arrives in task 09.
 * Shares the ['day', 'today'] cache with the Log page, so logging on one shows up on the other.
 */
export function DayPage() {
  const { date } = useParams();
  const day = useDay(date ?? "today");
  const estimating = useIsMutating({ mutationKey: createEntryKey }) > 0;

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex-1 space-y-4">
        {day.isPending ? (
          <DaySkeleton />
        ) : day.isError ? (
          <div role="alert" className="space-y-3 py-12 text-center">
            <p className="text-destructive">Couldn't load this day: {day.error.message}</p>
            <Button variant="outline" className="h-11" onClick={() => day.refetch()} disabled={day.isFetching}>
              Try again
            </Button>
          </div>
        ) : (
          <>
            <HeaderCard day={day.data} />
            <MacroBars day={day.data} />
            <MealLog day={day.data} pending={estimating} />

            {/* Slots for the follow-on tasks: each adds one component here and nothing else on this page. */}
            <div className="empty:hidden">
              <BurnsList day={day.data} />
            </div>

            <div className="empty:hidden">{/* Task 08: <WeightCard day={day.data} /> */}</div>
          </>
        )}
      </div>
      <Composer />
    </div>
  );
}

function DaySkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading day">
      <Skeleton className="h-40 rounded-xl" />
      <Skeleton className="h-32 rounded-xl" />
      <Skeleton className="h-28 rounded-xl" />
    </div>
  );
}
