import { formatShortDate, type DayResponse } from "@calorie-tracker/shared";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { lazy, Suspense, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ErrorBoundary } from "@/components/error-boundary";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { WeightDrawer } from "@/components/weight-drawer";
import { useDeleteWeight } from "@/hooks/use-weight";
import { fmt } from "@/lib/meals";

// Recharts is most of the chart's weight, so it loads as its own chunk after the card first shows.
const WeightTrendChart = lazy(() =>
  import("@/components/weight-trend-chart").then((m) => ({ default: m.WeightTrendChart })),
);

/**
 * That day's weight with edit and delete, or a prompt to log one, above the weight trend chart.
 * `today` is the server's today (YYYY-MM-DD), so the prompt can name a past day.
 */
export function WeightCard({ day, today }: { day: DayResponse; today: string }) {
  const [editOpen, setEditOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const deleteWeight = useDeleteWeight(day.date);
  const { weight } = day;

  return (
    <section aria-label="Weight" className="rounded-xl border bg-card p-4 text-card-foreground shadow-xs">
      <h2 className="text-sm font-medium text-muted-foreground">Weight</h2>
      {weight ? (
        <div className="mt-1 flex items-center justify-between gap-3">
          <p className="flex items-baseline gap-2 tabular-nums">
            <span className="text-3xl leading-none font-bold">{fmt(weight.weight_lb)}</span>
            <span className="text-sm font-medium text-muted-foreground">lb</span>
          </p>
          <div className="-mr-2 flex shrink-0 gap-1">
            <Button variant="ghost" size="icon" className="size-11" aria-label="Edit weight" onClick={() => setEditOpen(true)}>
              <Pencil />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-11 text-destructive hover:text-destructive"
              aria-label="Delete weight"
              onClick={() => setConfirmOpen(true)}
            >
              <Trash2 />
            </Button>
          </div>
        </div>
      ) : (
        <Button variant="outline" className="mt-2 h-11 w-full justify-start text-base" onClick={() => setEditOpen(true)}>
          <Plus /> {day.date === today ? "Log today's weight" : `Log a weight for ${formatShortDate(day.date, today)}`}
        </Button>
      )}

      <ErrorBoundary
        fallback={
          <p role="alert" className="mt-4 border-t pt-4 text-sm text-destructive">
            Couldn&apos;t load the weight chart. Reload to try again.
          </p>
        }
      >
        <Suspense fallback={<Skeleton className="mt-4 h-72 w-full" />}>
          <WeightTrendChart date={day.date} />
        </Suspense>
      </ErrorBoundary>

      <WeightDrawer date={day.date} weight={weight} open={editOpen} onOpenChange={setEditOpen} />

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this weight?</AlertDialogTitle>
            <AlertDialogDescription>{weight ? `${fmt(weight.weight_lb)} lb` : "This weight"} will be removed.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90 dark:bg-destructive/60 dark:hover:bg-destructive/50"
              disabled={deleteWeight.isPending}
              onClick={(e) => {
                // Keep the dialog open until the request settles.
                e.preventDefault();
                deleteWeight.mutate(undefined, { onSettled: () => setConfirmOpen(false) });
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
