import type { Burn } from "@calorie-tracker/shared";
import { LoaderCircle } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCreateBurn, useDeleteBurn, useUpdateBurn } from "@/hooks/use-burns";

/** A positive whole number, or null if the text isn't one. */
function parseCalories(text: string): number | null {
  if (text.trim() === "") return null;
  const n = Number(text);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/**
 * Bottom sheet for a burn: pass `burn` to edit or delete it, omit it to add a new one (today, decided by the server).
 */
export function BurnDrawer({
  burn,
  open,
  onOpenChange,
}: {
  burn?: Burn;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        {/* Mounted only while open, so the form starts from the saved values every time. */}
        <BurnForm burn={burn} close={() => onOpenChange(false)} />
      </DrawerContent>
    </Drawer>
  );
}

function BurnForm({ burn, close }: { burn?: Burn; close: () => void }) {
  const [calories, setCalories] = useState(burn ? String(burn.calories) : "");
  const [note, setNote] = useState(burn?.note ?? "");
  const createBurn = useCreateBurn();
  const updateBurn = useUpdateBurn();
  const deleteBurn = useDeleteBurn();
  const saving = createBurn.isPending || updateBurn.isPending;
  const busy = saving || deleteBurn.isPending;

  const parsed = parseCalories(calories);
  const valid = parsed !== null;

  function save() {
    if (parsed === null || busy) return;
    if (!burn) return createBurn.mutate({ calories: parsed, note: note.trim() || null }, { onSuccess: close });
    // Only changed fields are sent; saving without edits just closes.
    const patch: { calories?: number; note?: string | null } = {};
    if (parsed !== burn.calories) patch.calories = parsed;
    if (note.trim() !== (burn.note ?? "")) patch.note = note.trim() || null;
    if (Object.keys(patch).length === 0) return close();
    updateBurn.mutate({ id: burn.id, ...patch }, { onSuccess: close });
  }

  return (
    <form
      className="flex min-h-0 flex-1 flex-col"
      onSubmit={(e) => {
        e.preventDefault();
        // React bubbles events through portals: without this the composer's form (the chip lives in it) would submit too.
        e.stopPropagation();
        save();
      }}
    >
      <DrawerHeader>
        <DrawerTitle>{burn ? "Edit burn" : "Add calories burned"}</DrawerTitle>
        <DrawerDescription className="sr-only">
          {burn ? "Change the calories or note, then save, or delete the burn." : "Enter the calories you burned, then save."}
        </DrawerDescription>
      </DrawerHeader>
      <div className="min-h-0 space-y-4 overflow-y-auto px-4 pb-2">
        <div className="space-y-2">
          <Label htmlFor="burn-calories">Calories burned (kcal)</Label>
          <Input
            id="burn-calories"
            inputMode="decimal"
            autoComplete="off"
            autoFocus={!burn}
            value={calories}
            onChange={(e) => setCalories(e.target.value)}
            aria-invalid={calories !== "" && !valid}
            className="h-11 tabular-nums"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="burn-note">Note (optional)</Label>
          <Input
            id="burn-note"
            autoComplete="off"
            maxLength={200}
            placeholder="evening run"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="h-11"
          />
        </div>
      </div>
      <DrawerFooter>
        <Button type="submit" className="h-11 text-base" disabled={!valid || busy}>
          {saving && <LoaderCircle className="animate-spin" />}
          Save
        </Button>
        {burn && (
          <Button
            type="button"
            variant="outline"
            className="h-11 text-base text-destructive hover:text-destructive"
            disabled={busy}
            onClick={() => deleteBurn.mutate(burn.id, { onSuccess: close })}
          >
            {deleteBurn.isPending && <LoaderCircle className="animate-spin" />}
            Delete burn
          </Button>
        )}
      </DrawerFooter>
    </form>
  );
}
