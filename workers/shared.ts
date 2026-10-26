import type { Official } from "../packages/shared/types";
export interface Env {
  DB: D1Database;
  INTERNAL_SECRET: string;
  CONFIG_KEY?: string;
  BOOTSTRAP_TOKEN?: string;
  NOTIFICATIONS?: Fetcher;
  CASEWORK: Fetcher;
  RELEVANCE: Fetcher;
  ASSETS: Fetcher;
  AI?: {
    run(
      model: string,
      input: unknown,
    ): Promise<{ data?: number[][]; translated_text?: string }>;
  };
  AUTH_LIMITER?: RateLimit;
  WRITE_LIMITER?: RateLimit;
}
export const userColumns = "id,name,designation,bureau,role,manager_id,is_demo";
export const json = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function fail(status: number, message: string): never {
  throw new HttpError(status, message);
}
export async function body(request: Request): Promise<Record<string, unknown>> {
  if (Number(request.headers.get("content-length")) > 24000)
    fail(413, "Request is too large.");
  const reader = request.body?.getReader();
  if (!reader) fail(400, "A request body is required.");
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const part = await reader.read();
    if (part.done) break;
    length += part.value.length;
    if (length > 24000) {
      await reader.cancel();
      fail(413, "Request is too large.");
    }
    chunks.push(part.value);
  }
  const bytes = new Uint8Array(length);
  let at = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, at);
    at += chunk.length;
  }
  try {
    const value = JSON.parse(new TextDecoder().decode(bytes));
    if (!value || typeof value !== "object" || Array.isArray(value))
      fail(400, "Invalid request.");
    return value;
  } catch {
    return fail(400, "Invalid request.");
  }
}
export function textField(value: unknown, label: string, max = 2000, min = 1) {
  if (
    typeof value !== "string" ||
    value.trim().length < min ||
    value.trim().length > max
  )
    fail(400, `${label} must contain ${min}–${max} characters.`);
  return value.trim();
}
export const now = () => new Date().toISOString();
export const id = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;
export function actor(request: Request, env: Env): Official {
  if (
    !env.INTERNAL_SECRET ||
    request.headers.get("x-internal-secret") !== env.INTERNAL_SECRET
  )
    fail(403, "Private service.");
  try {
    return (
      JSON.parse(request.headers.get("x-actor") || "null") ||
      fail(401, "Sign in required.")
    );
  } catch {
    return fail(401, "Sign in required.");
  }
}
export async function guard(fn: () => Promise<Response>) {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof HttpError)
      return json({ error: error.message }, error.status);
    console.error(
      "Workspace request failed",
      error instanceof Error ? error.message : "Unknown error",
    );
    return json(
      { error: "The request could not be completed. Please try again." },
      500,
    );
  }
}
