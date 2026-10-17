// en-CA formats dates as YYYY-MM-DD.
const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string | undefined) {
  const key = timeZone ?? "";
  let fmt = formatters.get(key);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    formatters.set(key, fmt);
  }
  return fmt;
}

/**
 * Today's date as YYYY-MM-DD in the container's time zone (`TZ`).
 * The day boundary is always decided here, never by the client.
 */
export function today(now: Date = new Date(), timeZone: string | undefined = process.env.TZ || undefined): string {
  return formatterFor(timeZone).format(now);
}

const timeFormatters = new Map<string, Intl.DateTimeFormat>();

/** The current wall-clock time as HH:MM (24h) in the container's time zone. */
export function localTime(now: Date = new Date(), timeZone: string | undefined = process.env.TZ || undefined): string {
  const key = timeZone ?? "";
  let fmt = timeFormatters.get(key);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
    timeFormatters.set(key, fmt);
  }
  return fmt.format(now);
}
