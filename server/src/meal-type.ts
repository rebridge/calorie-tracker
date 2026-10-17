import type { MealType } from "@calorie-tracker/shared";

function minutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h! * 60 + m!;
}

// [start (inclusive), meal] in ascending order; each runs until the next start.
const slots: Array<[number, MealType]> = [
  [0, "breakfast"],
  [minutes("10:30"), "lunch"],
  [minutes("14:30"), "snack"],
  [minutes("17:00"), "dinner"],
  [minutes("21:00"), "snack"],
];

/** Time-of-day fallback for today's entries. `time` is local HH:MM. */
export function mealTypeForTime(time: string): MealType {
  const t = minutes(time);
  let meal: MealType = "breakfast";
  for (const [start, m] of slots) if (t >= start) meal = m;
  return meal;
}

/** Request's meal_type wins, then Claude's, then the time-of-day fallback. */
export function resolveMealType({
  requested,
  fromModel,
  localTime,
}: {
  requested: MealType | null | undefined;
  fromModel: MealType | null;
  localTime: string;
}): MealType {
  return requested ?? fromModel ?? mealTypeForTime(localTime);
}
