import {
  DayResponseSchema,
  EntrySchema,
  type CreateEntryRequest,
  type DayResponse,
} from "@calorie-tracker/shared";
import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { ApiError, apiGet, apiPost } from "@/lib/api";

/**
 * Day queries are keyed ['day', date]: `date` is "today" (always the server's today) or a YYYY-MM-DD.
 * Today's key stays "today" even though its response carries the resolved date, so the Log and Day pages share one cache entry.
 * Past days only change through this app, and every edit invalidates them, so they can sit fresh for a while;
 * today is kept fresher so a tab left open overnight rolls over soon after it's refocused.
 */
const TODAY_STALE_MS = 30_000;
const PAST_STALE_MS = 5 * 60_000;

/** Don't retry a 4xx (a future or malformed date): it would only delay the error state by several seconds. */
const retryDay = (failures: number, err: Error) =>
  !(err instanceof ApiError && err.status >= 400 && err.status < 500) && failures < 3;

export function dayQueryOptions(date: string) {
  return {
    queryKey: ["day", date] as const,
    queryFn: () => apiGet(`/api/day/${encodeURIComponent(date)}`, DayResponseSchema),
    staleTime: date === "today" ? TODAY_STALE_MS : PAST_STALE_MS,
    retry: retryDay,
  };
}

/** `date` is YYYY-MM-DD or "today"; the server decides what today is. */
export function useDay(date: string) {
  return useQuery(dayQueryOptions(date));
}

/**
 * Refreshes the day an edit landed on, plus "today" unless that day is known to be in the past (so editing
 * a past day doesn't refetch an unchanged today). "Known" means strictly before the cached today's date;
 * a cache that's out of date can only be older than the real today, so it never hides a real today.
 */
export function invalidateDay(queryClient: QueryClient, localDate: string) {
  const cachedToday = queryClient.getQueryData<DayResponse>(["day", "today"])?.date;
  const isPast = cachedToday !== undefined && localDate < cachedToday;
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: ["day", localDate] }),
    isPast ? undefined : queryClient.invalidateQueries({ queryKey: ["day", "today"] }),
  ]);
}

/** Lets other components (e.g. the log's skeleton card) see when an entry is being estimated. */
export const createEntryKey = ["createEntry"];

export function useCreateEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: createEntryKey,
    mutationFn: (body: CreateEntryRequest) => apiPost("/api/entries", body, EntrySchema),
    onSuccess: (entry) => invalidateDay(queryClient, entry.local_date),
  });
}
