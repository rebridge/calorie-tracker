import type { EntryItem, UpdateItemRequest } from "@calorie-tracker/shared";
import { LoaderCircle } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useDeleteItem, useUpdateItem } from "@/hooks/use-edit-entries";

type NumericField = "calories" | "protein_g" | "carbs_g" | "fat_g";

const numericFields: { key: NumericField; label: string }[] = [
  { key: "calories", label: "Calories (kcal)" },
  { key: "protein_g", label: "Protein (g)" },
  { key: "carbs_g", label: "Carbs (g)" },
  { key: "fat_g", label: "Fat (g)" },
];

/** A non-negative number, or null if the text isn't one. */
function parseNumber(text: string): number | null {
  if (text.trim() === "") return null;
  const n = Number(text);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** Bottom sheet with every field of one item editable, plus Save and Delete. */
export function ItemEditDrawer({
  item,
  open,
  onOpenChange,
}: {
  item: EntryItem;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        {/* Mounted only while open, so the form starts from the saved values every time. */}
        <ItemForm item={item} close={() => onOpenChange(false)} />
      </DrawerContent>
    </Drawer>
  );
}

function ItemForm({ item, close }: { item: EntryItem; close: () => void }) {
  const [name, setName] = useState(item.name);
  const [portion, setPortion] = useState(item.portion);
  const [numbers, setNumbers] = useState<Record<NumericField, string>>({
    calories: String(item.calories),
    protein_g: String(item.protein_g),
    carbs_g: String(item.carbs_g),
    fat_g: String(item.fat_g),
  });
  const updateItem = useUpdateItem();
  const deleteItem = useDeleteItem();
  const busy = updateItem.isPending || deleteItem.isPending;

  // Only changed fields are sent, so saving without edits doesn't mark the item edited.
  const patch: UpdateItemRequest = {};
  if (name.trim() !== item.name) patch.name = name.trim();
  if (portion.trim() !== item.portion) patch.portion = portion.trim();
  let valid = name.trim() !== "" && portion.trim() !== "";
  const invalid = new Set<NumericField>();
  for (const { key } of numericFields) {
    const n = parseNumber(numbers[key]);
    if (n === null) {
      invalid.add(key);
      valid = false;
    } else if (n !== item[key]) {
      patch[key] = n;
    }
  }
  const dirty = Object.keys(patch).length > 0;

  function save() {
    if (!valid || busy) return;
    if (!dirty) return close();
    updateItem.mutate({ id: item.id, ...patch }, { onSuccess: close });
  }

  return (
    <form
      className="flex min-h-0 flex-1 flex-col"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <DrawerHeader>
        <DrawerTitle>Edit item</DrawerTitle>
        <DrawerDescription className="sr-only">Change any field, then save, or delete the item.</DrawerDescription>
      </DrawerHeader>
      <div className="grid min-h-0 grid-cols-2 gap-x-3 gap-y-4 overflow-y-auto px-4 pb-2">
        <div className="col-span-2 space-y-2">
          <Label htmlFor="item-name">Name</Label>
          <Input id="item-name" value={name} onChange={(e) => setName(e.target.value)} aria-invalid={name.trim() === ""} />
        </div>
        <div className="col-span-2 space-y-2">
          <Label htmlFor="item-portion">Portion</Label>
          <Input
            id="item-portion"
            value={portion}
            onChange={(e) => setPortion(e.target.value)}
            aria-invalid={portion.trim() === ""}
          />
        </div>
        {numericFields.map(({ key, label }) => (
          <div key={key} className="space-y-2">
            <Label htmlFor={`item-${key}`}>{label}</Label>
            <Input
              id={`item-${key}`}
              inputMode="decimal"
              autoComplete="off"
              value={numbers[key]}
              onChange={(e) => setNumbers((prev) => ({ ...prev, [key]: e.target.value }))}
              aria-invalid={invalid.has(key)}
              className="tabular-nums"
            />
          </div>
        ))}
      </div>
      <DrawerFooter>
        <Button type="submit" className="h-11 text-base" disabled={!valid || busy}>
          {updateItem.isPending && <LoaderCircle className="animate-spin" />}
          Save
        </Button>
        <Button
          type="button"
          variant="outline"
          className="h-11 text-base text-destructive hover:text-destructive"
          disabled={busy}
          onClick={() => deleteItem.mutate(item.id, { onSuccess: close })}
        >
          {deleteItem.isPending && <LoaderCircle className="animate-spin" />}
          Delete item
        </Button>
      </DrawerFooter>
    </form>
  );
}
