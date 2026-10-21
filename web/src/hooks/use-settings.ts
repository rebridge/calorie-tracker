import { SettingsResponseSchema, type Settings } from "@calorie-tracker/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPut } from "@/lib/api";

export const settingsKey = ["settings"];

/** Goals plus read-only info (model, database path). */
export function useSettings() {
  return useQuery({
    queryKey: settingsKey,
    queryFn: () => apiGet("/api/settings", SettingsResponseSchema),
  });
}

export function useUpdateSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: Settings) => apiPut("/api/settings", body, SettingsResponseSchema),
    // Goals show up on every day, so all cached days go stale, not just one date.
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: settingsKey }),
        queryClient.invalidateQueries({ queryKey: ["day"] }),
      ]),
  });
}
