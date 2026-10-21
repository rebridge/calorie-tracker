import {
  formatShortDate,
  WEIGHT_RANGE_DAYS,
  WeightRangeSchema,
  type WeightRange,
  type WeightsResponse,
} from "@calorie-tracker/shared";
import { useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, ReferenceLine, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useWeightTrend } from "@/hooks/use-weight";
import { fmt } from "@/lib/meals";

const RANGES: WeightRange[] = ["30d", "90d", "1y"];

const RANGE_KEY = "weight-range";
/** The chart remounts on every day change; this keeps the chosen range (and survives a reload where storage allows). */
let selectedRange: WeightRange = (() => {
  try {
    const stored = WeightRangeSchema.safeParse(localStorage.getItem(RANGE_KEY));
    if (stored.success) return stored.data;
  } catch {
    // Storage can be blocked (private mode); the module variable still carries the choice across days.
  }
  return "30d";
})();

function rememberRange(range: WeightRange) {
  selectedRange = range;
  try {
    localStorage.setItem(RANGE_KEY, range);
  } catch {
    // Not persisted across reloads; fine.
  }
}

const chartConfig = {
  weight: { label: "Daily", color: "var(--chart-2)" },
  avg: { label: "7-day avg", color: "var(--chart-1)" },
} satisfies ChartConfig;

const CHART_HEIGHT = "h-52";

/** Spacing between x-axis labels, counted back from today so the last label is always today. */
const TICK_STEP_DAYS: Record<WeightRange, number> = { "30d": 10, "90d": 30, "1y": 73 };

const MS_PER_DAY = 86_400_000;
/** A YYYY-MM-DD as a whole day count since the epoch: a numeric x value, so a gap in the readings is a gap on the axis. */
const dayNumber = (date: string) => Date.parse(`${date}T00:00:00Z`) / MS_PER_DAY;

// Pinned to en-US and UTC, like the other date labels, so a tick never shifts with the phone's locale or zone.
const tickMonthDay = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const tickMonth = new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" });
/** "Oct '25", so a bare "Oct 25" can't be read as the 25th. */
const tickMonthYear = {
  format: (d: Date) => `${tickMonth.format(d)} '${String(d.getUTCFullYear()).slice(-2)}`,
};

/** Y-axis bounds and gridlines: whole-number steps (1, 2, 5, 10, …) that leave the data a pound or so of room. */
function yAxisTicks(values: number[]): { domain: [number, number]; ticks: number[] } {
  const [min, max] = [Math.min(...values) - 1, Math.max(...values) + 1];
  const rough = (max - min) / 4;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const step = Math.max(1, magnitude * ([1, 2, 5, 10].find((m) => m * magnitude >= rough) ?? 10));
  const [lo, hi] = [Math.floor(min / step) * step, Math.ceil(max / step) * step];
  const ticks: number[] = [];
  for (let t = lo; t <= hi; t += step) ticks.push(t);
  return { domain: [lo, hi], ticks };
}

/**
 * The weight trend: daily readings plus the 7-day moving average over 30d / 90d / 1y, always ending at the
 * server's today, with a marker on `date` (the viewed day) when it falls inside the range.
 */
export function WeightTrendChart({ date }: { date: string }) {
  const [range, setRange] = useState<WeightRange>(selectedRange);
  const trend = useWeightTrend(range);

  return (
    <div className="mt-4 space-y-3 border-t pt-4">
      <ToggleGroup
        type="single"
        variant="outline"
        value={range}
        // Tapping the selected range would clear it; a range is always chosen.
        onValueChange={(value) => {
          const next = WeightRangeSchema.safeParse(value);
          if (!next.success) return;
          rememberRange(next.data);
          setRange(next.data);
        }}
        aria-label="Chart range"
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
          <p className="text-sm text-destructive">Couldn&apos;t load the trend: {trend.error.message}</p>
          <Button variant="outline" className="h-11" onClick={() => trend.refetch()} disabled={trend.isFetching}>
            Try again
          </Button>
        </div>
      ) : trend.isPending ? (
        <Skeleton className={`${CHART_HEIGHT} w-full`} />
      ) : trend.data.points.length === 0 ? (
        <p className={`flex ${CHART_HEIGHT} items-center justify-center text-center text-sm text-muted-foreground`}>
          No weights logged in the last {range === "1y" ? "year" : `${WEIGHT_RANGE_DAYS[range]} days`}.
        </p>
      ) : (
        <TrendPlot trend={trend.data} date={date} />
      )}
    </div>
  );
}

function TrendPlot({ trend, date }: { trend: WeightsResponse; date: string }) {
  const { range, from, today } = trend;

  const rows = useMemo(() => {
    const avgByDate = new Map(trend.moving_avg.map((p) => [p.date, p.avg_lb]));
    return trend.points.map((p) => ({
      x: dayNumber(p.date),
      date: p.date,
      weight: p.weight_lb,
      avg: avgByDate.get(p.date),
    }));
  }, [trend]);

  const [start, end] = [dayNumber(from), dayNumber(today)];
  const ticks = useMemo(() => {
    const out: number[] = [];
    for (let t = end; t >= start; t -= TICK_STEP_DAYS[range]) out.unshift(t);
    return out;
  }, [range, start, end]);

  const { domain, ticks: yTicks } = yAxisTicks(rows.flatMap((r) => (r.avg === undefined ? [r.weight] : [r.weight, r.avg])));

  const marked = date >= from && date <= today;
  const format = range === "1y" ? tickMonthYear : tickMonthDay;

  return (
    <div>
      <ChartContainer config={chartConfig} className={`aspect-auto ${CHART_HEIGHT} w-full`}>
        <LineChart data={rows} margin={{ top: 8, right: 24, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} />
          <XAxis
            dataKey="x"
            type="number"
            domain={[start, end]}
            ticks={ticks}
            tickFormatter={(n: number) => format.format(new Date(n * MS_PER_DAY))}
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            interval={0}
          />
          <YAxis
            domain={domain}
            ticks={yTicks}
            width={36}
            tickLine={false}
            axisLine={false}
            tickFormatter={(n: number) => fmt(n)}
          />
          <ChartTooltip
            content={
              <ChartTooltipContent
                labelFormatter={(_, payload) => {
                  const d = (payload[0]?.payload as { date?: string } | undefined)?.date;
                  return d ? formatShortDate(d, today) : "";
                }}
              />
            }
          />
          {marked && <ReferenceLine x={dayNumber(date)} stroke="var(--chart-3)" strokeWidth={2} strokeDasharray="4 3" />}
          <Line
            dataKey="weight"
            type="linear"
            stroke="var(--color-weight)"
            strokeWidth={1}
            dot={{ r: 3, fill: "var(--color-weight)", strokeWidth: 0 }}
            activeDot={{ r: 5 }}
            isAnimationActive={false}
          />
          <Line
            dataKey="avg"
            type="monotone"
            stroke="var(--color-avg)"
            strokeWidth={3}
            dot={false}
            activeDot={{ r: 5 }}
            isAnimationActive={false}
          />
        </LineChart>
      </ChartContainer>

      <ul className="mt-2 flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <li className="flex items-center gap-1.5">
          <span className="size-2 rounded-full" style={{ background: "var(--chart-2)" }} /> Daily
        </li>
        <li className="flex items-center gap-1.5">
          <span className="h-[3px] w-4 rounded-full" style={{ background: "var(--chart-1)" }} /> 7-day avg
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
