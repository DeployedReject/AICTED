import type { Env } from "../shared";
import { fail } from "../shared";
import type { Query, Result } from "./contracts";
// Private D1-compatible client: all consumers use one routing authority.
export function applicationEnv(env: Env, expected?: string | null): Env {
  if (!env.DATABASE) return env;
  const generation = { value: expected || undefined };
  const run = async (queries: Query[]): Promise<Result[]> => {
    const response = await env.DATABASE!.fetch(
      new Request("https://database/query", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-internal-secret": env.INTERNAL_SECRET,
        },
        body: JSON.stringify({ queries, generation: generation.value }),
      }),
    );
    const payload = (await response.json()) as {
      results: Result[];
      generation: string;
      error?: string;
    };
    if (!response.ok)
      fail(
        response.status,
        payload.error ||
          "Application database unavailable. IT can repair the connection in Database settings.",
      );
    if (generation.value && generation.value !== payload.generation)
      fail(
        409,
        "The database changed during this request. Reload and try again.",
      );
    generation.value = payload.generation;
    return payload.results;
  };
  class Statement {
    constructor(
      public sql: string,
      public params: unknown[] = [],
    ) {}
    bind(...params: unknown[]) {
      return new Statement(this.sql, params);
    }
    async all() {
      return (await run([{ sql: this.sql, params: this.params }]))[0];
    }
    run() {
      return this.all();
    }
    async first(column?: string) {
      const row = (await this.all()).results[0];
      return column ? (row?.[column] ?? null) : (row ?? null);
    }
    async raw() {
      return (await this.all()).results.map((row) => Object.values(row));
    }
  }
  const db = {
    prepare: (sql: string) => new Statement(sql),
    batch: (statements: Statement[]) =>
      run(statements.map((s) => ({ sql: s.sql, params: s.params }))),
    exec: () => fail(400, "Use the schema setup action."),
  } as unknown as D1Database;
  return { ...env, CONTROL_DB: env.DB, DB: db, DB_GENERATION: generation };
}
