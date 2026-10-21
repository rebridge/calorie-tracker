import { Scale } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { WeightDrawer } from "@/components/weight-drawer";
import { useDay } from "@/hooks/use-day";

/**
 * Quick-action chip above the composer: "+ Weight", or "Edit weight" when the day already has one.
 * `date` is YYYY-MM-DD or "today"; the day's weight comes from the shared ['day', date] query.
 */
export function AddWeightChip({ date = "today" }: { date?: string }) {
  const [open, setOpen] = useState(false);
  const weight = useDay(date).data?.weight ?? null;

  return (
    <>
      <Button type="button" variant="outline" className="h-11 rounded-full" onClick={() => setOpen(true)}>
        <Scale />
        {weight ? "Edit weight" : "+ Weight"}
      </Button>
      <WeightDrawer date={date} weight={weight} open={open} onOpenChange={setOpen} />
    </>
  );
}
