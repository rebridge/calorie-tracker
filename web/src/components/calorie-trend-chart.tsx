import { formatShortDate, WEIGHT_RANGE_DAYS, WeightRangeSchema, type CaloriesResponse, type WeightRange } from "@calorie-tracker/shared";
import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { ChartContainer, ChartTooltip, type ChartConfig } from "@/components/ui/chart";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useCalorieTrend } from "@/hooks/use-calories";
import { dayNumber, RANGES, rangeMemory, tickFormatter, xAxisTicks } from "@/lib/chart-axis";
import { fmt } from "@/lib/meals";

const rangeChoice = rangeMemory("calorie-range");

const chartConfig = {
  net: { label: "Net" },
} satisfies ChartConfig;

const UNDER = "var(--chart-4)";
const OVER = "var(--destructive)";

/**
 * Y-axis bounds and gridlines in round steps (250, 500, 1,000, …) from zero (or below, for a day that burned more
 * than it ate) to past the highest bar and the goal line, so both are always in view.
 */
function yAxisTicks(values: number[]): { domain: [number, number]; ticks: number[] } {
  const [min, max] = [Math.min(0, ...values), Math.max(100, ...values)];
  const step = [250, 500, 1000, 2500].find((s) => s * 5 >= max - min) ?? 5000;
  const [lo, hi] = [Math.floor(min / step) * step, Math.ceil(max / step) * step];
  const ticks: number[] = [];
  for (let t = lo; t <= hi; t += step) ticks.push(t);
  return { domain: [lo, hi], ticks };
}

const CHART_HEIGHT = "h-52";

/**
 * Each day's net calories (eaten − burned, as the budget counts them) against the calorie goal over 30d / 90d / 1y,
 * always ending at the server's today, with a marker on `date` (the viewed day) when it falls inside the range.
 * Bars rise from zero to the day's net, with a dashed goal line across: a red bar crosses it (over), a teal one
 * stops short (under). Days with nothing logged are gaps.
 */
export function CalorieTrendChart({ date }: { date: string }) {
  const [range, setRange] = useState<WeightRange>(rangeChoice.get);
  const trend = useCalorieTrend(range);

  return (
    <div className="mt-3 space-y-3">
      <ToggleGroup
        type="single"
        variant="outline"
        value={range}
        // Tapping the selected range would clear it; a range is always chosen.
        onValueChange={(value) => {
          const next = WeightRangeSchema.safeParse(value);
          if (!next.success) return;
          rangeChoice.set(next.data);
          setRange(next.data);
        }}
        aria-label="Calories chart range"
        className="w-full"
      >
        {RANGES.map((r) => (
          <ToggleGroupItem key={r} value={r} className="h-11 text-sm">
            {r}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>

      {trend.isError ? (
        <div role="alert" className={`flex ${CHART_HEIGHT} flex-col items-center justify-center gap-2 text-center`}>
          <p className="text-sm text-destructive">Couldn&apos;t load calories: {trend.error.message}</p>
          <Button variant="outline" className="h-11" onClick={() => trend.refetch()} disabled={trend.isFetching}>
            Try again
          </Button>
        </div>
      ) : trend.isPending ? (
        <Skeleton className={`${CHART_HEIGHT} w-full`} />
      ) : trend.data.points.length === 0 ? (
        <p className={`flex ${CHART_HEIGHT} items-center justify-center text-center text-sm text-muted-foreground`}>
          Nothing logged in the last {range === "1y" ? "year" : `${WEIGHT_RANGE_DAYS[range]} days`}.
        </p>
      ) : (
        <CaloriesPlot trend={trend.data} date={date} />
      )}
    </div>
  );
}

type Row = { x: number; date: string; eaten: number; burned: number; net: number; diff: number };

function CaloriesPlot({ trend, date }: { trend: CaloriesResponse; date: string }) {
  const { range, from, today, goal_kcal: goal } = trend;

  const rows = useMemo<Row[]>(
    () =>
      trend.points.map((p) => {
        const net = p.eaten_kcal - p.burned_kcal;
        return { x: dayNumber(p.date), date: p.date, eaten: p.eaten_kcal, burned: p.burned_kcal, net, diff: net - goal };
      }),
    [trend, goal],
  );
  const ticks = useMemo(() => xAxisTicks(range, from, today), [range, from, today]);

  // Today is still in progress, so it would read as under goal; the summary covers finished days only.
  const done = rows.filter((r) => r.date < today);
  const avg = done.length ? Math.round(done.reduce((sum, r) => sum + r.diff, 0) / done.length) : null;
  const under = done.filter((r) => r.diff <= 0).length;

  const { domain, ticks: yTicks } = yAxisTicks([goal, ...rows.map((r) => r.net)]);
  const marked = date >= from && date <= today;

  return (
    <div>
      <p className="mb-2 text-sm text-muted-foreground">
        Goal {fmt(goal)}
        {avg !== null && (
          <>
            {" · avg "}
            <span className="font-medium tabular-nums" style={{ color: avg > 0 ? OVER : UNDER }}>
              {fmt(Math.abs(avg))} {avg > 0 ? "over" : "under"}
            </span>
            {` · ${under}/${done.length} days under`}
          </>
        )}
      </p>
      <ChartContainer config={chartConfig} className={`aspect-auto ${CHART_HEIGHT} w-full`}>
        <BarChart data={rows} margin={{ top: 8, right: 24, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} />
          <XAxis
            dataKey="x"
            type="number"
            // Half a day of room each side so the first and last bars aren't cut in half.
            domain={[dayNumber(from) - 0.5, dayNumber(today) + 0.5]}
            ticks={ticks}
            tickFormatter={tickFormatter(range)}
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            interval={0}
          />
          <YAxis domain={domain} ticks={yTicks} width={44} tickLine={false} axisLine={false} tickFormatter={(n: number) => fmt(n)} />
          <ChartTooltip cursor={{ fill: "var(--muted)", opacity: 0.6 }} content={<GoalTooltip goal={goal} today={today} />} />
          {marked && <ReferenceLine x={dayNumber(date)} stroke="var(--chart-3)" strokeWidth={2} strokeDasharray="4 3" />}
          <Bar dataKey="net" radius={[2, 2, 0, 0]} isAnimationActive={false}>
            {rows.map((r) => (
              <Cell key={r.date} fill={r.diff > 0 ? OVER : UNDER} />
            ))}
          </Bar>
          {/* After the bars so the line stays visible across them. */}
          <ReferenceLine y={goal} stroke="var(--foreground)" strokeWidth={1.5} strokeDasharray="6 4" ifOverflow="extendDomain" />
        </BarChart>
      </ChartContainer>

      <ul className="mt-2 flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <li className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-[2px]" style={{ background: UNDER }} /> Under goal
        </li>
        <li className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-[2px]" style={{ background: OVER }} /> Over goal
        </li>
        <li className="flex items-center gap-1.5">
          <span className="w-4 border-t-[1.5px] border-dashed border-foreground" /> Goal
        </li>
        {marked && (
          <li className="flex items-center gap-1.5">
            <span className="h-3 w-0 border-l-2 border-dashed" style={{ borderColor: "var(--chart-3)" }} />
            {date === today ? "Today" : formatShortDate(date, today)}
          </li>
        )}
      </ul>
    </div>
  );
}

/** "Mon, Oct 13 · 1,920 vs 2,000 goal · 80 under", with the eaten and burned that make up the net. */
function GoalTooltip({ goal, today, active, payload }: { goal: number; today: string; active?: boolean; payload?: { payload: Row }[] }) {
  const row = active ? payload?.[0]?.payload : undefined;
  if (!row) return null;
  const over = row.diff > 0;
  return (
    <div className="grid min-w-36 gap-1 rounded-lg border bg-background px-2.5 py-1.5 text-xs shadow-xl">
      <p className="font-medium">{formatShortDate(row.date, today)}</p>
      <p className="tabular-nums">
        <span className="font-medium">{fmt(row.net)}</span> vs {fmt(goal)} goal
      </p>
      <p className="font-medium tabular-nums" style={{ color: over ? OVER : UNDER }}>
        {row.diff === 0 ? "On goal" : `${fmt(Math.abs(row.diff))} ${over ? "over" : "under"}`}
      </p>
      {row.burned > 0 && (
        <p className="text-muted-foreground tabular-nums">
          {fmt(row.eaten)} eaten − {fmt(row.burned)} burned
        </p>
      )}
    </div>
  );
}
