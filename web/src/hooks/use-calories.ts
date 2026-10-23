import { CaloriesResponseSchema, type WeightRange } from "@calorie-tracker/shared";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api";

/**
 * Daily calories eaten vs burned, keyed ['calories', range]. `invalidateDay` refreshes the whole ['calories'] prefix,
 * so any entry or burn change shows up here.
 */
export function useCalorieTrend(range: WeightRange) {
  return useQuery({
    queryKey: ["calories", range] as const,
    queryFn: () => apiGet(`/api/calories?range=${range}`, CaloriesResponseSchema),
    staleTime: 5 * 60_000,
  });
}
