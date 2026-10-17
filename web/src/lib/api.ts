import type { z } from "zod";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Fetches a JSON endpoint and validates the body against a shared Zod schema. */
export async function apiGet<T extends z.ZodType>(path: string, schema: T): Promise<z.infer<T>> {
  const res = await fetch(path, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new ApiError(res.status, `${res.status} ${res.statusText}`);
  return schema.parse(await res.json());
}
