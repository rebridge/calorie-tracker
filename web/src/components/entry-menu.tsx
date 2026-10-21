import { MEAL_TYPES, type Entry } from "@calorie-tracker/shared";
import { ArrowRightLeft, Check, EllipsisVertical, Trash2 } from "lucide-react";
import { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useDeleteEntry, useUpdateEntry } from "@/hooks/use-edit-entries";
import { mealLabels } from "@/lib/meals";

/** Overflow menu on an entry card: change its meal type or delete it. */
export function EntryMenu({ entry }: { entry: Entry }) {
  const [mealPickerOpen, setMealPickerOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const updateEntry = useUpdateEntry();
  const deleteEntry = useDeleteEntry();

  return (
    <>
      <DropdownMenu>
        {/* A plain button: Radix needs to attach a ref, which the function-component Button can't take on React 18. */}
        <DropdownMenuTrigger
          aria-label="Entry options"
          className="-mt-2 -mr-3 flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          <EllipsisVertical className="size-5" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setMealPickerOpen(true)}>
            <ArrowRightLeft /> Change meal type
          </DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onSelect={() => setConfirmOpen(true)}>
            <Trash2 /> Delete entry
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Drawer open={mealPickerOpen} onOpenChange={setMealPickerOpen}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>Change meal type</DrawerTitle>
            <DrawerDescription className="sr-only">Pick the meal this entry belongs to.</DrawerDescription>
          </DrawerHeader>
          <div className="space-y-2 px-4 pb-4">
            {MEAL_TYPES.map((meal) => (
              <Button
                key={meal}
                variant={meal === entry.meal_type ? "secondary" : "outline"}
                className="h-12 w-full justify-between text-base"
                disabled={updateEntry.isPending}
                onClick={() =>
                  meal === entry.meal_type
                    ? setMealPickerOpen(false)
                    : updateEntry.mutate({ id: entry.id, meal_type: meal }, { onSuccess: () => setMealPickerOpen(false) })
                }
              >
                {mealLabels[meal]}
                {meal === entry.meal_type && <Check />}
              </Button>
            ))}
          </div>
        </DrawerContent>
      </Drawer>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this entry?</AlertDialogTitle>
            <AlertDialogDescription>
              “{entry.raw_text}” and its {entry.items.length === 1 ? "item" : `${entry.items.length} items`} will be removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90 dark:bg-destructive/60 dark:hover:bg-destructive/50"
              disabled={deleteEntry.isPending}
              onClick={(e) => {
                // Keep the dialog open until the request settles; it disappears with the card on success.
                e.preventDefault();
                deleteEntry.mutate(entry.id, { onSettled: () => setConfirmOpen(false) });
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
