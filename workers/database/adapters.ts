import postgres from "postgres";
import type { Env } from "../shared";
import { fail } from "../shared";
import { unseal } from "../vault";
import type { Profile, Query, Result } from "./contracts";
import { sqliteSchema, postgresSchema } from "./schema";
function placeholders(sql: string) {
  let index = 0;
  return sql.replace(/'(?:''|[^'])*'|\?/g, (token) => {
    if (token === "?") return "$" + ++index;
    return token;
  });
}
// The application uses a small shared SQL vocabulary; the two dialect differences
// are explicit here. Values always remain bound parameters.
export function pgQuery(input: Query): Query {
  let sql = input.sql,
    params = [...input.params];
  if (sql.includes("official_search MATCH")) {
    const before =
      sql.slice(0, sql.indexOf("official_search MATCH")).match(/\?/g)?.length ||
      0;
    params[before] = String(params[before])
      .replace(/"([\p{L}\p{N}]+)"\*/gu, "$1:*")
      .replaceAll(" AND ", " & ");
    sql = sql
      .replace(
        "FROM official_search JOIN officials o ON o.rowid=official_search.rowid",
        "FROM officials o",
      )
      .replace(
        "official_search MATCH ?",
        "to_tsvector('simple',o.name || ' ' || o.id || ' ' || o.designation || ' ' || o.bureau) @@ to_tsquery('simple',?)",
      )
      .replace("ORDER BY rank", "ORDER BY o.name");
  }
  sql = sql.replace(
    /([a-zA-Z_][a-zA-Z0-9_.]*) LIKE \?/g,
    "lower($1) LIKE lower(?)",
  );
  sql = sql
    .replace(
      /([a-zA-Z_][a-zA-Z0-9_.]*)=\? COLLATE NOCASE/g,
      "lower($1)=lower(?)",
    )
    .replace(/INSERT OR IGNORE INTO/g, "INSERT INTO");
  if (input.sql.includes("INSERT OR IGNORE") && !/ON CONFLICT/i.test(sql))
    sql += " ON CONFLICT DO NOTHING";
  sql = sql.replace(
    "INSERT OR REPLACE INTO tag_cache(cache_key,suggestions,expires_at) VALUES(?,?,?)",
    "INSERT INTO tag_cache(cache_key,suggestions,expires_at) VALUES(?,?,?) ON CONFLICT(cache_key) DO UPDATE SET suggestions=excluded.suggestions,expires_at=excluded.expires_at",
  );
  // SUM of conditions is spelled out so NULL/false remain zero on both engines.
  let start = 0;
  while ((start = sql.indexOf("SUM(", start)) !== -1) {
    let depth = 1,
      end = start + 4,
      inQuote = false;
    for (; end < sql.length && depth; end++) {
      const ch = sql[end];
      if (ch === "'") inQuote = !inQuote;
      if (!inQuote) {
        if (ch === "(") depth++;
        if (ch === ")") depth--;
      }
    }
    const expression = sql.slice(start + 4, end - 1);
    if (expression.includes("=") && !expression.startsWith("CASE ")) {
      const next = "SUM(CASE WHEN " + expression + " THEN 1 ELSE 0 END)";
      sql = sql.slice(0, start) + next + sql.slice(end);
      start += next.length;
    } else start = end;
  }
  sql = sql
    .replace(/\bMIN\(([^(),]+),([^(),]+)\)/g, "LEAST($1,$2)")
    .replace(/\bMAX\(([^(),]+),([^(),]+)\)/g, "GREATEST($1,$2)")
    .replace(/\bAS overlaps\b/gi, 'AS "overlaps"')
    .replace(/\) overlaps(?=,|\s|$)/g, ') "overlaps"');
  return { sql: placeholders(sql), params };
}
export class Connection {
  private client: ReturnType<typeof postgres> | null = null;
  constructor(
    private env: Env,
    public profile: Profile,
  ) {}
  async query(queries: Query[]): Promise<Result[]> {
    if (this.profile.source === "bound")
      return (await this.env.DB.batch(
        queries.map((q) => this.env.DB.prepare(q.sql).bind(...q.params)),
      )) as unknown as Result[];
    const credential = await unseal(
      this.env,
      this.profile.credential,
      "database:" + this.profile.id,
    );
    if (this.profile.source === "d1") {
      const response = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${this.profile.account_id}/d1/database/${this.profile.database_id}/query`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer " + credential,
          },
          body: JSON.stringify({ batch: queries }),
          signal: AbortSignal.timeout(25000),
        },
      );
      const result = (await response.json()) as {
        success: boolean;
        result: Result[];
      };
      if (
        !response.ok ||
        !result.success ||
        result.result?.some((r) => !r.success)
      )
        fail(
          502,
          "D1 rejected the database operation. Check the account, database ID, token permissions and schema.",
        );
      return result.result.map((r) => ({
        ...r,
        meta: {
          changes: r.meta?.changes || 0,
          duration: r.meta?.duration || 0,
        },
        results: r.results || [],
      }));
    }
    this.client ||= postgres({
      host: this.profile.host,
      port: this.profile.port,
      database: this.profile.database_name,
      username: this.profile.username,
      password: credential,
      ssl: "require",
      max: 1,
      prepare: false,
      connect_timeout: 10,
      idle_timeout: 1,
      types: { bigint: postgres.BigInt },
      onnotice: () => {},
      connection: { statement_timeout: 20000, application_name: "aicted" },
    });
    const result = await this.client.begin(async (transaction) => {
      const values: Result[] = [];
      for (const query of queries) {
        const q = pgQuery(query);
        const rows = await transaction.unsafe(q.sql, q.params as never[]);
        values.push({
          results: rows.map((row) =>
            Object.fromEntries(
              Object.entries(row).map(([k, v]) => [
                k,
                typeof v === "bigint" ? Number(v) : v,
              ]),
            ),
          ),
          success: true,
          meta: {
            changes: ["SELECT", "SHOW", "WITH"].includes(rows.command)
              ? 0
              : rows.count,
            duration: 0,
          },
        });
      }
      return values;
    });
    return result as Result[];
  }
  async schema() {
    if (this.profile.source === "postgres") {
      const credential = await unseal(
        this.env,
        this.profile.credential,
        "database:" + this.profile.id,
      );
      this.client ||= postgres({
        host: this.profile.host,
        port: this.profile.port,
        database: this.profile.database_name,
        username: this.profile.username,
        password: credential,
        ssl: "require",
        max: 1,
        prepare: false,
        connect_timeout: 10,
        onnotice: () => {},
        connection: { statement_timeout: 20000 },
      });
      await this.client.unsafe(postgresSchema).simple();
    } else {
      await this.query(sqliteSchema.map((sql) => ({ sql, params: [] })));
    }
  }
  async close() {
    if (this.client) await this.client.end({ timeout: 1 });
    this.client = null;
  }
}
