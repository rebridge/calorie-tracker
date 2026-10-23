import { formatShortDate, WEIGHT_RANGE_DAYS, WeightRangeSchema, type CaloriesResponse, type WeightRange } from "@calorie-tracker/shared";
import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, ReferenceLine, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useCalorieTrend } from "@/hooks/use-calories";
import { dayNumber, RANGES, rangeMemory, tickFormatter, xAxisTicks } from "@/lib/chart-axis";
import { fmt } from "@/lib/meals";

const rangeChoice = rangeMemory("calorie-range");

const chartConfig = {
  eaten: { label: "Eaten", color: "var(--chart-1)" },
  burned: { label: "Burned", color: "var(--chart-4)" },
} satisfies ChartConfig;

const CHART_HEIGHT = "h-52";

/**
 * Calories eaten vs burned per day over 30d / 90d / 1y, always ending at the server's today, with a marker on
 * `date` (the viewed day) when it falls inside the range. Each day is one column: eaten rises above zero and
 * burned hangs below it, so in vs out reads at a glance even at a year's density. Days with nothing logged are gaps.
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

function CaloriesPlot({ trend, date }: { trend: CaloriesResponse; date: string }) {
  const { range, from, today } = trend;

  // Burned is drawn below zero; the axis and tooltip show it as a positive number.
  const rows = useMemo(
    () => trend.points.map((p) => ({ x: dayNumber(p.date), date: p.date, eaten: p.eaten_kcal, burned: -p.burned_kcal })),
    [trend],
  );
  const ticks = useMemo(() => xAxisTicks(range, from, today), [range, from, today]);

  const marked = date >= from && date <= today;

  return (
    <div>
      <ChartContainer config={chartConfig} className={`aspect-auto ${CHART_HEIGHT} w-full`}>
        <BarChart data={rows} stackOffset="sign" margin={{ top: 8, right: 24, bottom: 0, left: 0 }}>
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
          <YAxis width={44} tickLine={false} axisLine={false} tickFormatter={(n: number) => fmt(Math.abs(n))} />
          <ChartTooltip
            cursor={{ fill: "var(--muted)", opacity: 0.6 }}
            content={
              <ChartTooltipContent
                labelFormatter={(_, payload) => {
                  const d = (payload[0]?.payload as { date?: string } | undefined)?.date;
                  return d ? formatShortDate(d, today) : "";
                }}
                formatter={(value, name, item) => (
                  <div className="flex flex-1 items-center gap-2">
                    <span className="size-2.5 shrink-0 rounded-[2px]" style={{ background: item.color }} />
                    <span className="flex-1 text-muted-foreground">{chartConfig[name as keyof typeof chartConfig].label}</span>
                    <span className="font-mono font-medium text-foreground tabular-nums">
                      {Math.abs(Number(value)).toLocaleString()}
                    </span>
                  </div>
                )}
              />
            }
          />
          <ReferenceLine y={0} stroke="var(--border)" />
          {marked && <ReferenceLine x={dayNumber(date)} stroke="var(--chart-3)" strokeWidth={2} strokeDasharray="4 3" />}
          <Bar dataKey="eaten" stackId="day" fill="var(--color-eaten)" radius={[2, 2, 0, 0]} isAnimationActive={false} />
          <Bar dataKey="burned" stackId="day" fill="var(--color-burned)" radius={[2, 2, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ChartContainer>

      <ul className="mt-2 flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <li className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-[2px]" style={{ background: "var(--chart-1)" }} /> Eaten
        </li>
        <li className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-[2px]" style={{ background: "var(--chart-4)" }} /> Burned
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
