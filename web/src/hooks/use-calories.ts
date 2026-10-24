import { CaloriesResponseSchema, type CalorieRange } from "@calorie-tracker/shared";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api";

/**
 * Daily calories eaten and burned plus the calorie goal, keyed ['calories', range]. `invalidateDay` refreshes the whole ['calories'] prefix,
 * so any entry or burn change shows up here; a goal change invalidates it from `useUpdateSettings`.
 */
export function useCalorieTrend(range: CalorieRange) {
  return useQuery({
    queryKey: ["calories", range] as const,
    queryFn: () => apiGet(`/api/calories?range=${range}`, CaloriesResponseSchema),
    staleTime: 5 * 60_000,
  });
}
