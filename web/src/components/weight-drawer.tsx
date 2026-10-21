import type { Weight } from "@calorie-tracker/shared";
import { LoaderCircle } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useDeleteWeight, useSaveWeight } from "@/hooks/use-weight";

/** A positive number in lb (comma decimals from some keyboards are fine), or null if the text isn't one. */
function parseWeight(text: string): number | null {
  const n = Number(text.trim().replace(",", "."));
  return text.trim() !== "" && Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Bottom sheet with one decimal input for a day's weight, prefilled when `weight` exists.
 * `date` is YYYY-MM-DD or "today". Existing weights also get a Delete button.
 */
export function WeightDrawer({
  date,
  weight,
  open,
  onOpenChange,
}: {
  date: string;
  weight: Weight | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        {/* Mounted only while open, so the input starts from the saved weight every time. */}
        <WeightForm date={date} weight={weight} close={() => onOpenChange(false)} />
      </DrawerContent>
    </Drawer>
  );
}

function WeightForm({ date, weight, close }: { date: string; weight: Weight | null; close: () => void }) {
  const [text, setText] = useState(weight ? String(weight.weight_lb) : "");
  const save = useSaveWeight(date);
  const remove = useDeleteWeight(date);
  const busy = save.isPending || remove.isPending;
  const value = parseWeight(text);

  function submit() {
    if (value === null || busy) return;
    if (value === weight?.weight_lb) return close();
    save.mutate({ weight_lb: value }, { onSuccess: close });
  }

  return (
    <form
      className="flex min-h-0 flex-1 flex-col"
      onSubmit={(e) => {
        e.preventDefault();
        // React bubbles events through portals; without this the Composer's form (which renders this drawer via the chip) would submit too.
        e.stopPropagation();
        submit();
      }}
    >
      <DrawerHeader>
        <DrawerTitle>{weight ? "Edit weight" : "Log weight"}</DrawerTitle>
        <DrawerDescription className="sr-only">Enter your weight in pounds, then save.</DrawerDescription>
      </DrawerHeader>
      <div className="space-y-2 px-4 pb-2">
        <Label htmlFor="weight-lb">Weight (lb)</Label>
        <Input
          id="weight-lb"
          inputMode="decimal"
          autoComplete="off"
          placeholder="e.g. 182.4"
          value={text}
          onChange={(e) => setText(e.target.value)}
          aria-invalid={text.trim() !== "" && value === null}
          className="h-11 text-base tabular-nums"
        />
      </div>
      <DrawerFooter>
        <Button type="submit" className="h-11 text-base" disabled={value === null || busy}>
          {save.isPending && <LoaderCircle className="animate-spin" />}
          Save
        </Button>
        {weight && (
          <Button
            type="button"
            variant="outline"
            className="h-11 text-base text-destructive hover:text-destructive"
            disabled={busy}
            onClick={() => remove.mutate(undefined, { onSuccess: close })}
          >
            {remove.isPending && <LoaderCircle className="animate-spin" />}
            Delete weight
          </Button>
        )}
      </DrawerFooter>
    </form>
  );
}
