import {
  DayResponseSchema,
  EntrySchema,
  type CreateEntryRequest,
} from "@calorie-tracker/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost } from "@/lib/api";

/** `date` is YYYY-MM-DD or "today"; the server decides what today is. */
export function useDay(date: string) {
  return useQuery({
    queryKey: ["day", date],
    queryFn: () => apiGet(`/api/day/${date}`, DayResponseSchema),
  });
}

export function useCreateEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateEntryRequest) => apiPost("/api/entries", body, EntrySchema),
    onSuccess: (entry) =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ["day", entry.local_date] }),
        queryClient.invalidateQueries({ queryKey: ["day", "today"] }),
      ]),
  });
}
