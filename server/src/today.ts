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
