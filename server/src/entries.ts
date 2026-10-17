import {
  MEAL_TYPES,
  type DayResponse,
  type Entry,
  type EntryItem,
  type Macros,
  type MealType,
} from "@calorie-tracker/shared";
import { asc, desc, eq, inArray } from "drizzle-orm";
import type { Estimate } from "./claude.js";
import type { Db } from "./db/index.js";
import { entries, entryItems } from "./db/schema.js";

const round1 = (n: number) => Math.round(n * 10) / 10;

function sum(rows: Macros[]): Macros {
  const total = { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 };
  for (const r of rows) {
    total.calories += r.calories;
    total.protein_g += r.protein_g;
    total.carbs_g += r.carbs_g;
    total.fat_g += r.fat_g;
  }
  return { ...total, protein_g: round1(total.protein_g), carbs_g: round1(total.carbs_g), fat_g: round1(total.fat_g) };
}

type EntryRow = typeof entries.$inferSelect;
type ItemRow = typeof entryItems.$inferSelect;

function toItem(r: ItemRow): EntryItem {
  return {
    id: r.id,
    entry_id: r.entryId,
    name: r.name,
    portion: r.portion,
    calories: r.calories,
    protein_g: r.proteinG,
    carbs_g: r.carbsG,
    fat_g: r.fatG,
    confidence: r.confidence,
    assumption: r.assumption,
    edited: r.edited,
  };
}

function toEntry(r: EntryRow, items: EntryItem[]): Entry {
  return {
    id: r.id,
    created_at: r.createdAt,
    local_date: r.localDate,
    meal_type: r.mealType,
    raw_text: r.rawText,
    ...sum(items),
    items,
  };
}

/** Saves an entry and its items in one transaction and returns it. */
export function createEntry(
  db: Db,
  { text, localDate, mealType, estimate, now = new Date() }: {
    text: string;
    localDate: string;
    mealType: MealType;
    estimate: Estimate;
    now?: Date;
  },
): Entry {
  return db.transaction((tx) => {
    const entry = tx
      .insert(entries)
      .values({
        createdAt: now.toISOString(),
        localDate,
        mealType,
        rawText: text,
        model: estimate.model,
        modelResponse: JSON.stringify(estimate.response),
        inputTokens: estimate.inputTokens,
        outputTokens: estimate.outputTokens,
      })
      .returning()
      .get();
    const items = tx
      .insert(entryItems)
      .values(
        estimate.meal.items.map((i) => ({
          entryId: entry.id,
          name: i.name,
          portion: i.portion,
          calories: Math.round(i.calories),
          proteinG: round1(i.protein_g),
          carbsG: round1(i.carbs_g),
          fatG: round1(i.fat_g),
          confidence: i.confidence,
          assumption: i.assumption,
        })),
      )
      .returning()
      .all();
    return toEntry(entry, items.map(toItem));
  });
}

/** One day's entries grouped by meal, with subtotals and totals derived from the items. */
export function getDay(db: Db, date: string): DayResponse {
  const entryRows = db
    .select()
    .from(entries)
    .where(eq(entries.localDate, date))
    .orderBy(desc(entries.createdAt), desc(entries.id))
    .all();
  const itemRows = entryRows.length
    ? db
        .select()
        .from(entryItems)
        .where(
          inArray(
            entryItems.entryId,
            entryRows.map((e) => e.id),
          ),
        )
        .orderBy(asc(entryItems.id))
        .all()
    : [];

  const itemsByEntry = new Map<number, EntryItem[]>();
  for (const r of itemRows) {
    const list = itemsByEntry.get(r.entryId) ?? [];
    list.push(toItem(r));
    itemsByEntry.set(r.entryId, list);
  }
  const dayEntries = entryRows.map((e) => toEntry(e, itemsByEntry.get(e.id) ?? []));

  const meals = MEAL_TYPES.map((meal_type) => {
    const mealEntries = dayEntries.filter((e) => e.meal_type === meal_type);
    return { meal_type, calories: sum(mealEntries).calories, entries: mealEntries };
  });

  return { date, meals, totals: sum(dayEntries) };
}
