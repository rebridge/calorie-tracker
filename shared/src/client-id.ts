import { z } from "zod";

// The iOS app records entries and burns offline and uploads them when it can reach the server.
// Each upload carries the phone's id for the record, so retrying one never saves it twice.

/** The phone's UUID for a record. Stored lowercased. */
export const ClientIdSchema = z.uuid().transform((id) => id.toLowerCase());

/**
 * When the phone logged it. Becomes `created_at`, so an entry uploaded hours later still sorts by when it was
 * logged; a time ahead of the server's clock is clamped to now.
 */
export const LoggedAtSchema = z.iso.datetime({ offset: true });
