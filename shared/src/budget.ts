/** Calories left for the day: goal − eaten + burned. Negative once the day is over budget. */
export function remainingKcal({ goal, eaten, burned }: { goal: number; eaten: number; burned: number }): number {
  return goal - eaten + burned;
}

/** How full a progress bar is, 0–100. Caps at 100 so going over a goal doesn't overflow the bar. */
export function progressPercent(value: number, goal: number): number {
  if (!(goal > 0) || !(value > 0)) return 0;
  return Math.min(100, (value / goal) * 100);
}
