import { addDays, LocalDateSchema } from "@calorie-tracker/shared";
import { useIsMutating, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router";
import { BurnsList } from "@/components/burns-list";
import { Composer } from "@/components/composer";
import { DateBar } from "@/components/date-bar";
import { HeaderCard, MacroBars } from "@/components/day-summary";
import { MealLog } from "@/components/meal-log";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { WeightCard } from "@/components/weight-card";
import { createEntryKey, dayQueryOptions, useDay } from "@/hooks/use-day";
import { useSwipe } from "@/hooks/use-swipe";
import { ApiError } from "@/lib/api";

/**
 * `/day/:date?`: no date param is today. Today's date comes from the server (the resolved `date` of
 * `/api/day/today`), never the client clock, and `/day/<today>` is redirected to `/day`.
 * Queries are keyed ['day', 'today'] for today (shared with the Log page) and ['day', 'YYYY-MM-DD'] for other days.
 */
export function DayPage() {
  const { date: param } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const today = useDay("today");
  const day = useDay(param ?? "today"); // the same query as `today` when there's no param
  const estimating = useIsMutating({ mutationKey: createEntryKey }) > 0;

  const todayDate = today.data?.date;
  // The date shown in the bar; unknown while today is loading, and absent for a malformed URL.
  const viewed = param === undefined ? todayDate : LocalDateSchema.safeParse(param).success ? param : undefined;
  const loadedDate = day.data?.date;

  function goTo(date: string) {
    navigate(date === todayDate ? "/day" : `/day/${date}`);
  }

  const swipe = useSwipe((step) => {
    if (!viewed || !todayDate) return;
    const next = addDays(viewed, step);
    if (next <= todayDate) goTo(next);
  });

  // Warm the cache for the neighbouring days so stepping to them is instant.
  useEffect(() => {
    if (!loadedDate || !todayDate || loadedDate > todayDate) return;
    void queryClient.prefetchQuery(dayQueryOptions(addDays(loadedDate, -1)));
    const next = addDays(loadedDate, 1);
    if (next < todayDate) void queryClient.prefetchQuery(dayQueryOptions(next));
  }, [queryClient, loadedDate, todayDate]);

  useEffect(() => window.scrollTo(0, 0), [param]);

  if (param !== undefined && param === todayDate) return <Navigate to="/day" replace />;

  return (
    <div className="flex flex-1 flex-col">
      {viewed && todayDate && <DateBar date={viewed} today={todayDate} onChange={goTo} />}
      {/* touch-pan-y hands horizontal drags to the swipe handler while the browser still scrolls and pinch-zooms. */}
      <div className="flex-1 touch-pan-y touch-pinch-zoom space-y-4" {...swipe}>
        {day.isError ? (
          <DayError error={day.error} onRetry={() => day.refetch()} retrying={day.isFetching} />
        ) : today.isError ? (
          <DayError error={today.error} onRetry={() => today.refetch()} retrying={today.isFetching} />
        ) : day.isPending || !todayDate ? (
          <DaySkeleton />
        ) : (
          // Keyed by date so no drawer or dialog state carries over from one day to the next.
          <div key={day.data.date} className="space-y-4">
            <HeaderCard day={day.data} />
            <MacroBars day={day.data} />
            <MealLog day={day.data} pending={estimating && param === undefined} />

            {/* Slots for the follow-on tasks: each adds one component here and nothing else on this page. */}
            <div className="empty:hidden">
              <BurnsList day={day.data} />
            </div>

            <div className="empty:hidden"><WeightCard day={day.data} today={todayDate} /></div>
          </div>
        )}
      </div>
      {/* The composer still saves to today, so it only shows there until backdating (task 10) gives it a `date`. */}
      {param === undefined && <Composer />}
    </div>
  );
}

function DayError({ error, onRetry, retrying }: { error: Error; onRetry: () => void; retrying: boolean }) {
  // A 4xx is a date the server refuses (in the future or malformed); trying again can't change that.
  const refused = error instanceof ApiError && error.status >= 400 && error.status < 500;

  return (
    <div role="alert" className="space-y-3 py-12 text-center">
      <p className="text-destructive">{refused ? `Can't show this day: ${error.message}` : `Couldn't load this day: ${error.message}`}</p>
      {refused ? (
        <Link to="/day" className={buttonVariants({ variant: "outline", className: "h-11" })}>
          Go to today
        </Link>
      ) : (
        <Button variant="outline" className="h-11" onClick={onRetry} disabled={retrying}>
          Try again
        </Button>
      )}
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
