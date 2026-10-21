import { z } from "zod";

/** YYYY-MM-DD that is also a real calendar date (rejects 2026-02-30). */
export const LocalDateSchema = z.iso.date();
