import { Composer } from "@/components/composer";
import { HealthStatus } from "@/components/health-status";
import { MealLog } from "@/components/meal-log";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useDay, useIsEstimating } from "@/hooks/use-day";

export function LogPage() {
  const day = useDay("today");
  const estimating = useIsEstimating();

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex-1 space-y-4">
        <HealthStatus />
        {day.isPending ? (
          <div className="space-y-4" aria-busy="true" aria-label="Loading today's log">
            <Skeleton className="h-6 w-28" />
            <Skeleton className="h-32 rounded-xl" />
            <Skeleton className="h-32 rounded-xl" />
          </div>
        ) : day.isError ? (
          <div role="alert" className="space-y-3 py-12 text-center">
            <p className="text-destructive">Couldn't load today's log: {day.error.message}</p>
            <Button variant="outline" className="h-11" onClick={() => day.refetch()} disabled={day.isFetching}>
              Try again
            </Button>
          </div>
        ) : (
          <MealLog day={day.data} pending={estimating} />
        )}
      </div>
      <Composer />
    </div>
  );
}
