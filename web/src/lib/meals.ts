import type { MealType } from "@calorie-tracker/shared";

export const mealLabels: Record<MealType, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  snack: "Snack",
};

/** Whole numbers stay whole; macros show at most one decimal. */
export const fmt = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 1 });
