import {
  DeleteEntryResponseSchema,
  DeleteItemResponseSchema,
  EntrySchema,
  UpdateEntryResponseSchema,
  UpdateItemResponseSchema,
  type UpdateEntryRequest,
  type UpdateItemRequest,
} from "@calorie-tracker/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { invalidateDay } from "@/hooks/use-day";
import { fmt } from "@/lib/meals";
import { apiDelete, apiPatch, apiPost } from "@/lib/api";

/** Every mutation response names the affected day; refresh that day's query (and "today", unless that day is in the past). */
export function useInvalidateDay() {
  const queryClient = useQueryClient();
  return ({ local_date }: { local_date: string }) => invalidateDay(queryClient, local_date);
}

const onError = (what: string) => (err: Error) => toast.error(`Couldn't ${what}: ${err.message}`);

export function useUpdateItem() {
  const invalidateDay = useInvalidateDay();
  return useMutation({
    mutationFn: ({ id, ...body }: UpdateItemRequest & { id: number }) =>
      apiPatch(`/api/items/${id}`, body, UpdateItemResponseSchema),
    onSuccess: invalidateDay,
    onError: onError("save that item"),
  });
}

export function useDeleteItem() {
  const invalidateDay = useInvalidateDay();
  return useMutation({
    mutationFn: (id: number) => apiDelete(`/api/items/${id}`, DeleteItemResponseSchema),
    onSuccess: invalidateDay,
    onError: onError("delete that item"),
  });
}

export function useUpdateEntry() {
  const invalidateDay = useInvalidateDay();
  return useMutation({
    mutationFn: ({ id, ...body }: UpdateEntryRequest & { id: number }) =>
      apiPatch(`/api/entries/${id}`, body, UpdateEntryResponseSchema),
    onSuccess: invalidateDay,
    onError: onError("change the meal type"),
  });
}

/** Logs a saved entry again today, as it stands now (edits included), without a new estimate. */
export function useRepeatEntry() {
  const invalidateDay = useInvalidateDay();
  return useMutation({
    mutationFn: (id: number) => apiPost(`/api/entries/${id}/repeat`, undefined, EntrySchema),
    onSuccess: (entry) => {
      toast.success(`Logged again today · ${fmt(entry.calories)} kcal`);
      return invalidateDay(entry);
    },
    onError: onError("log that again"),
  });
}

export function useDeleteEntry() {
  const invalidateDay = useInvalidateDay();
  return useMutation({
    mutationFn: (id: number) => apiDelete(`/api/entries/${id}`, DeleteEntryResponseSchema),
    onSuccess: invalidateDay,
    onError: onError("delete that entry"),
  });
}
