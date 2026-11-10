import {
  MEAL_TYPES,
  type DayResponse,
  type Entry,
  type EntryItem,
  type Macros,
  type MealType,
  type UpdateEntryRequest,
  type UpdateItemRequest,
} from "@calorie-tracker/shared";
import { asc, count, desc, eq, inArray } from "drizzle-orm";
import type { Estimate } from "./claude.js";
import { getBurns } from "./burns.js";
import type { Db } from "./db/index.js";
import { entries, entryItems } from "./db/schema.js";
import { getGoals } from "./settings.js";
import { getWeight } from "./weights.js";

const round1 = (n: number) => Math.round(n * 10) / 10;
/** The model's numbers aren't range-checked by its schema; a negative amount is nonsense, so floor it at 0. */
const nonNegative = (n: number) => Math.max(0, n);

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
          calories: Math.round(nonNegative(i.calories)),
          proteinG: round1(nonNegative(i.protein_g)),
          carbsG: round1(nonNegative(i.carbs_g)),
          fatG: round1(nonNegative(i.fat_g)),
          confidence: i.confidence,
          assumption: i.assumption,
        })),
      )
      .returning()
      .all();
    return toEntry(entry, items.map(toItem));
  });
}

/**
 * Logs a saved entry again on `localDate` without asking the model: same text, meal type and items, including
 * any edits made to them. The copy records no tokens, since none were spent. Undefined if the entry doesn't exist.
 */
export function repeatEntry(db: Db, id: number, { localDate, now = new Date() }: { localDate: string; now?: Date }) {
  return db.transaction((tx) => {
    const source = tx.select().from(entries).where(eq(entries.id, id)).get();
    if (!source) return undefined;
    const sourceItems = tx.select().from(entryItems).where(eq(entryItems.entryId, id)).orderBy(asc(entryItems.id)).all();
    const entry = tx
      .insert(entries)
      .values({
        createdAt: now.toISOString(),
        localDate,
        mealType: source.mealType,
        rawText: source.rawText,
        model: source.model,
        modelResponse: source.modelResponse,
        inputTokens: 0,
        outputTokens: 0,
      })
      .returning()
      .get();
    // An entry always has at least one item: deleting its last one deletes the entry.
    const items = tx
      .insert(entryItems)
      .values(sourceItems.map(({ id: _id, entryId: _entryId, ...item }) => ({ ...item, entryId: entry.id })))
      .returning()
      .all();
    return toEntry(entry, items.map(toItem));
  });
}

/** Edits an item and marks it edited. Undefined if the item doesn't exist. */
export function updateItem(db: Db, id: number, patch: UpdateItemRequest) {
  return db.transaction((tx) => {
    const row = tx
      .update(entryItems)
      .set({
        ...(patch.name !== undefined && { name: patch.name }),
        ...(patch.portion !== undefined && { portion: patch.portion }),
        ...(patch.calories !== undefined && { calories: Math.round(patch.calories) }),
        ...(patch.protein_g !== undefined && { proteinG: round1(patch.protein_g) }),
        ...(patch.carbs_g !== undefined && { carbsG: round1(patch.carbs_g) }),
        ...(patch.fat_g !== undefined && { fatG: round1(patch.fat_g) }),
        edited: true,
      })
      .where(eq(entryItems.id, id))
      .returning()
      .get();
    if (!row) return undefined;
    const entry = tx.select({ localDate: entries.localDate }).from(entries).where(eq(entries.id, row.entryId)).get()!;
    return { local_date: entry.localDate, item: toItem(row) };
  });
}

/** Deletes an item, and its entry too when it was the last one. Undefined if the item doesn't exist. */
export function deleteItem(db: Db, id: number) {
  return db.transaction((tx) => {
    const item = tx.select().from(entryItems).where(eq(entryItems.id, id)).get();
    if (!item) return undefined;
    const entry = tx.select().from(entries).where(eq(entries.id, item.entryId)).get()!;
    tx.delete(entryItems).where(eq(entryItems.id, id)).run();
    const { remaining } = tx
      .select({ remaining: count() })
      .from(entryItems)
      .where(eq(entryItems.entryId, item.entryId))
      .get()!;
    if (remaining === 0) tx.delete(entries).where(eq(entries.id, item.entryId)).run();
    return { local_date: entry.localDate, entry_deleted: remaining === 0 };
  });
}

/** Changes an entry's meal type. Undefined if the entry doesn't exist. */
export function updateEntry(db: Db, id: number, patch: UpdateEntryRequest) {
  return db.transaction((tx) => {
    const row = tx.update(entries).set({ mealType: patch.meal_type }).where(eq(entries.id, id)).returning().get();
    if (!row) return undefined;
    const items = tx.select().from(entryItems).where(eq(entryItems.entryId, id)).orderBy(asc(entryItems.id)).all();
    return { local_date: row.localDate, entry: toEntry(row, items.map(toItem)) };
  });
}

/** Deletes an entry; its items go with it via the foreign key cascade. Undefined if it doesn't exist. */
export function deleteEntry(db: Db, id: number) {
  const row = db.delete(entries).where(eq(entries.id, id)).returning({ localDate: entries.localDate }).get();
  return row && { local_date: row.localDate };
}

/** One day's entries grouped by meal, plus burns, weight, goals and totals derived by query. */
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

  const burns = getBurns(db, date);
  const eaten = sum(dayEntries);

  return {
    date,
    meals,
    burns,
    weight: getWeight(db, date),
    goals: getGoals(db),
    totals: {
      eaten_kcal: eaten.calories,
      burned_kcal: burns.reduce((total, b) => total + b.calories, 0),
      protein_g: eaten.protein_g,
      carbs_g: eaten.carbs_g,
      fat_g: eaten.fat_g,
    },
  };
}
