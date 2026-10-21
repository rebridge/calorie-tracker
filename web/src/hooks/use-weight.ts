import {
  DeleteWeightResponseSchema,
  PutWeightResponseSchema,
  type PutWeightRequest,
} from "@calorie-tracker/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiDelete, apiPut } from "@/lib/api";

/** Refresh the affected day, "today" (which may be the same day), and the weight chart queries (`['weights', range]`). */
function useInvalidateWeight() {
  const queryClient = useQueryClient();
  return ({ local_date }: { local_date: string }) =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["day", local_date] }),
      queryClient.invalidateQueries({ queryKey: ["day", "today"] }),
      queryClient.invalidateQueries({ queryKey: ["weights"] }),
    ]);
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
