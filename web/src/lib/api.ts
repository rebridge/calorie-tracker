import type { z } from "zod";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T extends z.ZodType>(path: string, schema: T, init?: RequestInit): Promise<z.infer<T>> {
  const res = await fetch(path, { ...init, headers: { Accept: "application/json", ...init?.headers } });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { reason?: string } | null;
    throw new ApiError(res.status, body?.reason ?? `${res.status} ${res.statusText}`);
  }
  return schema.parse(await res.json());
}

/** Fetches a JSON endpoint and validates the body against a shared Zod schema. */
export function apiGet<T extends z.ZodType>(path: string, schema: T): Promise<z.infer<T>> {
  return request(path, schema);
}

/** PUTs a JSON body and validates the response against a shared Zod schema. */
export function apiPut<T extends z.ZodType>(path: string, body: unknown, schema: T): Promise<z.infer<T>> {
  return request(path, schema, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** POSTs a JSON body and validates the response against a shared Zod schema. */
export function apiPost<T extends z.ZodType>(path: string, body: unknown, schema: T): Promise<z.infer<T>> {
  return request(path, schema, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** PATCHes a JSON body and validates the response against a shared Zod schema. */
export function apiPatch<T extends z.ZodType>(path: string, body: unknown, schema: T): Promise<z.infer<T>> {
  return request(path, schema, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** DELETEs a resource and validates the response against a shared Zod schema. */
export function apiDelete<T extends z.ZodType>(path: string, schema: T): Promise<z.infer<T>> {
  return request(path, schema, { method: "DELETE" });
}
