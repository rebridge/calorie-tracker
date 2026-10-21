import {
  BurnSchema,
  DeleteBurnResponseSchema,
  type CreateBurnRequest,
  type UpdateBurnRequest,
} from "@calorie-tracker/shared";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiDelete, apiPatch, apiPost } from "@/lib/api";
import { useInvalidateDay } from "@/hooks/use-edit-entries";

const onError = (what: string) => (err: Error) => toast.error(`Couldn't ${what}: ${err.message}`);

/** `body.date` is the day to add to (YYYY-MM-DD); omitted means today. */
export function useCreateBurn() {
  const invalidateDay = useInvalidateDay();
  return useMutation({
    mutationFn: (body: CreateBurnRequest) => apiPost("/api/burns", body, BurnSchema),
    onSuccess: invalidateDay,
    onError: onError("save that burn"),
  });
}

export function useUpdateBurn() {
  const invalidateDay = useInvalidateDay();
  return useMutation({
    mutationFn: ({ id, ...body }: UpdateBurnRequest & { id: number }) => apiPatch(`/api/burns/${id}`, body, BurnSchema),
    onSuccess: invalidateDay,
    onError: onError("save that burn"),
  });
}

export function useDeleteBurn() {
  const invalidateDay = useInvalidateDay();
  return useMutation({
    mutationFn: (id: number) => apiDelete(`/api/burns/${id}`, DeleteBurnResponseSchema),
    onSuccess: invalidateDay,
    onError: onError("delete that burn"),
  });
}
