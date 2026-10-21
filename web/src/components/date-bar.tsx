import { addDays, formatDayLabel, fromCalendarDate, toCalendarDate } from "@calorie-tracker/shared";
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/**
 * ‹ label › at the top of the Day view. `date` and `today` are YYYY-MM-DD (today as the server resolved it).
 * › is disabled on today; the label opens a calendar with later dates disabled.
 */
export function DateBar({ date, today, onChange }: { date: string; today: string; onChange: (date: string) => void }) {
  const [calendarOpen, setCalendarOpen] = useState(false);
  const selected = toCalendarDate(date);

  return (
    <nav
      aria-label="Choose day"
      className="sticky top-[calc(3.5rem+env(safe-area-inset-top)+1px)] z-[5] -mx-4 -mt-4 mb-4 flex items-center justify-between border-b bg-background/90 px-2 backdrop-blur"
    >
      <Button variant="ghost" size="icon" className="size-11" aria-label="Previous day" onClick={() => onChange(addDays(date, -1))}>
        <ChevronLeft className="size-5" />
      </Button>

      <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
        {/* Styled directly rather than asChild: Button is a plain function component (React 18) and can't hold the popover's anchor ref. */}
        <PopoverTrigger
          className={buttonVariants({ variant: "ghost", className: "h-11 min-w-40 gap-1.5 px-4 text-base font-semibold" })}
          aria-label={`${formatDayLabel(date, today)}, choose a date`}
        >
          {formatDayLabel(date, today)}
          <ChevronDown className="size-4 text-muted-foreground" />
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0">
          <Calendar
            mode="single"
            required
            selected={selected}
            defaultMonth={selected}
            today={toCalendarDate(today)}
            endMonth={toCalendarDate(today)}
            disabled={{ after: toCalendarDate(today) }}
            onSelect={(picked) => {
              setCalendarOpen(false);
              onChange(fromCalendarDate(picked));
            }}
          />
        </PopoverContent>
      </Popover>

      <Button
        variant="ghost"
        size="icon"
        className="size-11"
        aria-label="Next day"
        disabled={date >= today}
        onClick={() => onChange(addDays(date, 1))}
      >
        <ChevronRight className="size-5" />
      </Button>
    </nav>
  );
}
