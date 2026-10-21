import { Plus } from "lucide-react";
import { useState } from "react";
import { BurnDrawer } from "@/components/burn-drawer";
import { Button } from "@/components/ui/button";

/** "+ Burned" quick action above the composer; opens the add-burn drawer. */
export function AddBurnedChip() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button type="button" variant="outline" className="h-11 rounded-full px-4" onClick={() => setOpen(true)}>
        <Plus /> Burned
      </Button>
      <BurnDrawer open={open} onOpenChange={setOpen} />
    </>
  );
}
