import { Composer } from "@/components/composer";
import { HealthStatus } from "@/components/health-status";
import { MealLog } from "@/components/meal-log";
import { useDay } from "@/hooks/use-day";

export function LogPage() {
  const day = useDay("today");

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex-1 space-y-4">
        <HealthStatus />
        {day.isPending ? (
          <p className="text-muted-foreground">Loading…</p>
        ) : day.isError ? (
          <p className="text-destructive">Couldn't load today's log: {day.error.message}</p>
        ) : (
          <MealLog day={day.data} />
        )}
      </div>
      <Composer />
    </div>
  );
}
