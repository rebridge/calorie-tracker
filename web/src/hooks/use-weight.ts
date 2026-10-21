import {
  DeleteWeightResponseSchema,
  PutWeightResponseSchema,
  WeightsResponseSchema,
  type PutWeightRequest,
  type WeightRange,
} from "@calorie-tracker/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { invalidateDay } from "@/hooks/use-day";
import { apiDelete, apiGet, apiPut } from "@/lib/api";

/**
 * The weight trend, keyed ['weights', range]. Each range is fetched once and then served from cache;
 * the weight mutations below invalidate the whole ['weights'] prefix, so every edit refreshes it.
 */
export function useWeightTrend(range: WeightRange) {
  return useQuery({
    queryKey: ["weights", range] as const,
    queryFn: () => apiGet(`/api/weights?range=${range}`, WeightsResponseSchema),
    staleTime: 5 * 60_000,
  });
}

/** Refresh the affected day, "today" (unless that day is in the past), and the weight chart queries (`['weights', range]`). */
function useInvalidateWeight() {
  const queryClient = useQueryClient();
  return ({ local_date }: { local_date: string }) =>
    Promise.all([invalidateDay(queryClient, local_date), queryClient.invalidateQueries({ queryKey: ["weights"] })]);
}

/** Logs or replaces a day's weight. `date` is YYYY-MM-DD or "today". */
export function useSaveWeight(date: string) {
  const invalidate = useInvalidateWeight();
  return useMutation({
    mutationFn: (body: PutWeightRequest) => apiPut(`/api/weights/${date}`, body, PutWeightResponseSchema),
    onSuccess: invalidate,
    onError: (err: Error) => toast.error(`Couldn't save the weight: ${err.message}`),
  });
}

export function useDeleteWeight(date: string) {
  const invalidate = useInvalidateWeight();
  return useMutation({
    mutationFn: () => apiDelete(`/api/weights/${date}`, DeleteWeightResponseSchema),
    onSuccess: invalidate,
    onError: (err: Error) => toast.error(`Couldn't delete the weight: ${err.message}`),
  });
}
