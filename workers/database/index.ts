import { columns } from "./schema";
import { DurableObject } from "cloudflare:workers";
import type { Env } from "../shared";
import type { Official } from "../../packages/shared/types";
import { actor, fail, guard, id, json, now, textField } from "../shared";
import { seal, unseal } from "../vault";
import { Connection } from "./adapters";
import { original, tables, keys } from "./contracts";
import type { MoveJob, Profile, Query } from "./contracts";
interface DatabaseEnv extends Env {
  ROUTER: DurableObjectNamespace<DatabaseRouter>;
}
interface Route {
  active_id: string;
  previous_id: string | null;
  maintenance: number;
  updated_at: string;
}
const clean = (p: Profile) => {
  const { credential, ...safe } = p;
  return { ...safe, has_credential: !!credential };
};
const q = (sql: string, ...params: unknown[]): Query => ({ sql, params });
const canonical = (row: Record<string, unknown>) =>
  JSON.stringify(
    Object.keys(row)
      .sort()
      .map((key) => [key, row[key]]),
  );
async function fingerprint(rows: Record<string, unknown>[]) {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(rows.map(canonical).join("\n")),
  );
  return [...new Uint8Array(bytes)]
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
}
export class DatabaseRouter extends DurableObject<DatabaseEnv> {
  private route: Route = {
    active_id: "original",
    previous_id: null,
    maintenance: 0,
    updated_at: "",
  };
  private job: MoveJob | null = null;
  private tail: Promise<unknown> = Promise.resolve();
  private profiles = new Map<string, Profile>();
  constructor(ctx: DurableObjectState, env: DatabaseEnv) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      const row = await env.DB.prepare(
        "SELECT * FROM database_route WHERE id=1",
      ).first<Route>();
      if (row) this.route = row;
      this.job = (await ctx.storage.get<MoveJob>("job")) || null;
      if (
        this.route.maintenance &&
        this.job &&
        !["complete", "failed"].includes(this.job.phase)
      )
        await ctx.storage.setAlarm(Date.now() + 1000);
      else if (this.route.maintenance) {
        this.route.maintenance = 0;
        await this.saveRoute();
      }
    });
  }
  private serial<T>(action: () => Promise<T>): Promise<T> {
    const task = this.tail.then(action, action);
    this.tail = task.catch(() => {});
    return task;
  }
  private async saveRoute() {
    this.route.updated_at = now();
    await this.env.DB.prepare(
      "UPDATE database_route SET active_id=?,previous_id=?,maintenance=?,updated_at=? WHERE id=1",
    )
      .bind(
        this.route.active_id,
        this.route.previous_id,
        this.route.maintenance,
        this.route.updated_at,
      )
      .run();
  }
  private async profile(id: string): Promise<Profile> {
    if (id === "original") return original;
    const cached = this.profiles.get(id);
    if (cached) return cached;
    const p = await this.env.DB.prepare(
      "SELECT * FROM database_profiles WHERE id=?",
    )
      .bind(id)
      .first<Profile>();
    if (!p) fail(404, "Database connection not found.");
    this.profiles.set(id, p);
    return p;
  }
  private async using<T>(profile: Profile, fn: (c: Connection) => Promise<T>) {
    const c = new Connection(this.env, profile);
    try {
      return await fn(c);
    } finally {
      await c.close();
    }
  }
  private async audit(user: Official, action: string, detail: string) {
    await this.env.DB.prepare(
      "INSERT INTO database_control_audit(id,actor_id,action,detail,created_at) VALUES(?,?,?,?,?)",
    )
      .bind(id("database-audit"), user.id, action, detail, now())
      .run();
  }
  private async validate(p: Profile) {
    return this.using(p, async (c) => {
      const version = (
        await c.query([
          q("SELECT version FROM app_schema ORDER BY version DESC LIMIT 1"),
        ])
      )[0].results[0];
      if (Number(version?.version) !== 10)
        fail(
          409,
          "Schema version 10 is required. Initialize an empty destination or follow Database help.",
        );
      if (p.source === "postgres") {
        const collation = (
          await c.query([
            q(
              "SELECT COUNT(*) n FROM information_schema.columns WHERE table_schema='public' AND table_name IN(" +
                tables.map(() => "?").join(",") +
                ") AND data_type='text' AND (collation_name IS NULL OR collation_name<>'C')",
              ...tables,
            ),
          ])
        )[0].results[0];
        if (Number(collation.n))
          fail(
            409,
            "Use the provided PostgreSQL schema with C text collation for stable cross-database transfer ordering.",
          );
      }
      // Validate every copied column, not only a version marker supplied by the target.
      // These named columns cover permissions, authentication, JSON fields and delivery.
      await c.query([
        q(
          "SELECT id,report_scope,email,password_hash,password_salt FROM officials LIMIT 0",
        ),
        q("SELECT tags,assigned_to,created_by,intake FROM cases LIMIT 0"),
        ...tables.map((table) =>
          q(`SELECT ${columns[table].join(",")} FROM ${table} LIMIT 0`),
        ),
        q("SELECT value FROM json_each(?)", '["probe"]'),
        q(
          "INSERT INTO app_schema(version,applied_at) VALUES(-1,?) ON CONFLICT(version) DO UPDATE SET applied_at=excluded.applied_at",
          now(),
        ),
        q("DELETE FROM app_schema WHERE version=-1"),
      ]);
      const triggerQuery =
        p.source === "postgres"
          ? "SELECT COUNT(*) n FROM pg_trigger WHERE NOT tgisinternal AND tgname IN('immutable_events','immutable_audit','case_event_mail')"
          : "SELECT COUNT(*) n FROM sqlite_master WHERE type='trigger' AND name IN('immutable_events_update','immutable_events_delete','admin_audit_immutable_update','admin_audit_immutable_delete','official_search_insert','official_search_update','official_search_delete','case_event_mail')";
      const triggers = (await c.query([q(triggerQuery)]))[0].results[0];
      if (Number(triggers.n) !== (p.source === "postgres" ? 3 : 8))
        fail(
          409,
          "Required history, directory or email triggers are missing. Use the provided schema.",
        );
      return "Connected; schema and read/write permissions verified.";
    });
  }
  fetch(request: Request): Promise<Response> {
    return this.serial(() =>
      guard(async () => {
        if (
          request.headers.get("x-internal-secret") !== this.env.INTERNAL_SECRET
        )
          fail(403, "Private database service.");
        const path = new URL(request.url).pathname;
        if (path === "/query") {
          if (this.route.maintenance)
            fail(
              503,
              "Database transfer in progress. Please try again shortly. IT settings remain available.",
            );
          const input = (await request.json()) as {
            queries: Query[];
            generation?: string;
          };
          const generation = this.route.active_id + ":" + this.route.updated_at;
          if (input.generation && input.generation !== generation)
            fail(409, "The active database changed. Reload before continuing.");
          if (
            !Array.isArray(input.queries) ||
            !input.queries.length ||
            input.queries.length > 100
          )
            fail(400, "Invalid database batch.");
          const results = await this.using(
            await this.profile(this.route.active_id),
            (c) => c.query(input.queries),
          );
          return json({ results, generation });
        }
        const user = actor(request, this.env);
        if (user.role !== "it") fail(403, "IT access is required.");
        if (request.method === "GET") {
          if (user.is_demo)
            return json({
              active: clean(original),
              previous_id: null,
              maintenance: false,
              profiles: [clean(original)],
              job: null,
              logs: [],
              is_demo: true,
            });
          const profiles = await this.env.DB.prepare(
            "SELECT * FROM database_profiles ORDER BY created_at",
          ).all<Profile>();
          const logs = await this.env.DB.prepare(
            "SELECT action,detail,created_at FROM database_control_audit ORDER BY created_at DESC LIMIT 15",
          ).all();
          return json({
            active: clean(await this.profile(this.route.active_id)),
            previous_id: this.route.previous_id,
            maintenance: !!this.route.maintenance,
            profiles: [clean(original), ...profiles.results.map(clean)],
            job: this.job,
            logs: logs.results,
            is_demo: !!user.is_demo,
          });
        }
        if (user.is_demo)
          fail(
            403,
            "Production IT access is required to configure or switch databases.",
          );
        const input = (await request.json()) as Record<string, unknown>,
          action = String(input.action);
        if (action === "save") {
          if (this.route.maintenance)
            fail(409, "Wait for the current transfer to finish.");
          const source = String(input.source),
            name = textField(input.name, "Connection name", 80);
          if (!["d1", "postgres"].includes(source))
            fail(400, "Choose D1 or PostgreSQL.");
          const profileId = id("connection"),
            databaseName = textField(input.database_name, "Database name", 80);
          const account =
              source === "d1"
                ? textField(input.account_id, "Account ID", 32)
                : "",
            database =
              source === "d1"
                ? textField(input.database_id, "Database ID", 36)
                : "";
          const host =
              source === "postgres" ? textField(input.host, "Host", 253) : "",
            username =
              source === "postgres"
                ? textField(input.username, "Database user", 80)
                : "",
            port = Number(input.port || 5432);
          if (
            source === "d1" &&
            (!/^[a-f0-9]{32}$/i.test(account) ||
              !/^[a-f0-9-]{36}$/i.test(database))
          )
            fail(400, "Enter valid Cloudflare account and database IDs.");
          if (
            source === "d1" &&
            database.toLowerCase() === original.database_id.toLowerCase()
          )
            fail(
              400,
              "Use the existing aicted-workspace connection for the original database.",
            );
          if (
            source === "postgres" &&
            (!/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z][a-z0-9-]+$/i.test(
              host,
            ) ||
              /\.(local|internal|localhost)$/i.test(host) ||
              !Number.isInteger(port) ||
              port < 1 ||
              port > 65535)
          )
            fail(
              400,
              "Use a public PostgreSQL hostname and valid port. Private networks need a supported public pooler endpoint.",
            );
          const credential = await seal(
            this.env,
            textField(
              input.credential,
              source === "d1" ? "API token" : "Password",
              4000,
            ),
            "database:" + profileId,
          );
          await this.env.DB.prepare(
            "INSERT INTO database_profiles(id,name,source,account_id,database_id,host,port,database_name,username,credential,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
          )
            .bind(
              profileId,
              name,
              source,
              account,
              database,
              host,
              port,
              databaseName,
              username,
              credential,
              now(),
            )
            .run();
          await this.audit(user, "connection_saved", name);
          return json({ ok: true, id: profileId });
        }
        const target = await this.profile(
          textField(input.id, "Connection", 80),
        );
        if (action === "reveal") {
          await this.audit(user, "credential_revealed", target.name);
          return json({
            value: target.credential
              ? await unseal(
                  this.env,
                  target.credential,
                  "database:" + target.id,
                )
              : "",
          });
        }
        if (action === "check") {
          let message = "",
            ok = 0;
          try {
            message = await this.validate(target);
            ok = 1;
          } catch {
            message =
              "Connection or schema check failed. Confirm credentials, network access, schema version and permissions. An empty database must be initialized first.";
          }
          if (target.id !== "original")
            await this.env.DB.prepare(
              "UPDATE database_profiles SET checked_at=?,checked_ok=?,check_message=? WHERE id=?",
            )
              .bind(now(), ok, message, target.id)
              .run();
          this.profiles.delete(target.id);
          await this.audit(
            user,
            "connection_checked",
            target.name + ": " + (ok ? "passed" : "failed"),
          );
          return json({ ok: !!ok, message });
        }
        if (action === "initialize") {
          if (
            target.id === this.route.active_id ||
            target.id === "original" ||
            this.route.maintenance
          )
            fail(
              409,
              "Only an inactive, empty destination can be initialized.",
            );
          await this.using(target, async (c) => {
            const query =
              target.source === "postgres"
                ? "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' LIMIT 1"
                : "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name<>'d1_migrations' LIMIT 1";
            if ((await c.query([q(query)]))[0].results.length)
              fail(
                409,
                "Initialization requires an empty database. Existing tables will not be overwritten.",
              );
            await c.schema();
          });
          await this.audit(user, "schema_initialized", target.name);
          return json({
            ok: true,
            message:
              "Schema initialized. Test the connection before activation.",
          });
        }
        if (action === "reset_incomplete") {
          if (
            this.route.maintenance ||
            target.id === this.route.active_id ||
            target.id === this.route.previous_id ||
            target.id === "original" ||
            !this.job ||
            this.job.target !== target.id ||
            this.job.mode !== "copy" ||
            this.job.phase !== "failed"
          )
            fail(
              409,
              "Only the inactive destination of a failed copy can be reset.",
            );
          if (input.confirm !== target.name)
            fail(
              400,
              "Type the destination name to confirm removal of its partial application records.",
            );
          await this.using(target, async (c) => {
            if (target.source === "postgres")
              await c.query(
                [...tables, "app_schema"]
                  .reverse()
                  .map((table) => q(`DROP TABLE IF EXISTS ${table} CASCADE`)),
              );
            else
              await c.query([
                q("PRAGMA defer_foreign_keys=ON"),
                ...[
                  "immutable_events_update",
                  "immutable_events_delete",
                  "admin_audit_immutable_update",
                  "admin_audit_immutable_delete",
                  "official_search_insert",
                  "official_search_update",
                  "official_search_delete",
                  "case_event_mail",
                ].map((name) => q(`DROP TRIGGER IF EXISTS ${name}`)),
                q("DROP TABLE IF EXISTS official_search"),
                ...[...tables, "app_schema"]
                  .reverse()
                  .map((table) => q(`DROP TABLE IF EXISTS ${table}`)),
              ]);
          });
          await this.env.DB.prepare(
            "UPDATE database_profiles SET checked_ok=0,check_message='Incomplete application schema removed. Initialize before retrying.' WHERE id=?",
          )
            .bind(target.id)
            .run();
          await this.audit(user, "partial_destination_reset", target.name);
          return json({
            ok: true,
            message:
              "Partial destination cleared. Initialize it again before retrying.",
          });
        }
        if (action === "activate") {
          if (this.route.maintenance)
            fail(409, "A transfer is already running.");
          if (target.id === this.route.active_id)
            fail(409, "This database is already active.");
          if (input.confirm !== target.name)
            fail(400, "Type the destination connection name to confirm.");
          const mode =
            input.mode === "copy"
              ? "copy"
              : input.mode === "prepared"
                ? "prepared"
                : fail(400, "Choose how to handle existing data.");
          await this.validate(target);
          if (mode === "copy")
            await this.using(target, async (c) => {
              const counts = await c.query(
                tables
                  .filter((t) => !["org_units", "tags"].includes(t))
                  .map((t) => q(`SELECT COUNT(*) n FROM ${t}`)),
              );
              if (counts.some((r) => Number(r.results[0].n) > 0))
                fail(
                  409,
                  "Copy requires an empty application dataset. Existing destination records will not be overwritten.",
                );
            });
          if (mode === "prepared") await this.requireAdmin(target, user.id);
          // The serialized router has drained earlier batches. All app reads/writes now stop.
          this.route.maintenance = 1;
          await this.saveRoute();
          this.job = {
            id: id("move"),
            source: this.route.active_id,
            target: target.id,
            mode,
            phase: mode === "copy" ? "copying" : "validating",
            table: 0,
            cursor: 0,
            copied: 0,
            source_counts: {},
            message:
              mode === "copy"
                ? "Copying application records."
                : "Verifying prepared database.",
            started_at: now(),
          };
          await this.ctx.storage.put("job", this.job);
          await this.ctx.storage.setAlarm(Date.now() + 1000);
          await this.audit(
            user,
            "activation_started",
            target.name + "; " + mode,
          );
          return json({ ok: true, job: this.job });
        }
        if (action === "cancel") {
          if (!this.route.maintenance || !this.job)
            fail(409, "No transfer is running.");
          this.job.phase = "failed";
          this.job.message =
            "Cancelled. Source database remains active; partial destination records were retained.";
          this.route.maintenance = 0;
          await this.saveRoute();
          await this.ctx.storage.put("job", this.job);
          await this.ctx.storage.deleteAlarm();
          await this.audit(user, "activation_cancelled", target.name);
          return json({ ok: true });
        }
        fail(400, "Unknown database action.");
      }),
    );
  }
  private async requireAdmin(profile: Profile, id: string) {
    await this.using(profile, async (c) => {
      const row = (
        await c.query([
          q(
            "SELECT id FROM officials WHERE id=? AND role='it' AND active=1 AND is_demo=0",
            id,
          ),
        ])
      )[0].results[0];
      if (!row)
        fail(
          409,
          "The prepared database must contain this production IT account ID. Import a full export or use the copy option.",
        );
    });
  }
  async alarm() {
    return this.serial(async () => {
      const job = this.job;
      if (
        !job ||
        !this.route.maintenance ||
        ["failed", "complete"].includes(job.phase)
      )
        return;
      try {
        const source = await this.profile(job.source),
          target = await this.profile(job.target);
        if (job.mode === "prepared") {
          await this.finish(target);
          return;
        }
        if (job.table >= tables.length) {
          await this.finish(target);
          return;
        }
        const table = tables[job.table],
          order = keys[table].join(","),
          limit = 20;
        const pageQuery = q(
          `SELECT * FROM ${table} ${job.last_keys ? `WHERE (${order})>(${keys[table].map(() => "?").join(",")})` : ""} ORDER BY ${order} LIMIT ?`,
          ...(job.last_keys || []),
          limit,
        );
        await this.using(source, async (from) =>
          this.using(target, async (to) => {
            const rows = (await from.query([pageQuery]))[0].results;
            if (job.phase === "copying") {
              if (rows.length) {
                const queries = rows.map((row) => {
                  const columns = Object.keys(row),
                    data = columns.map((key) =>
                      table === "officials" && key === "manager_id"
                        ? null
                        : row[key],
                    );
                  const mutable = !["case_events", "admin_audit"].includes(
                      table,
                    ),
                    nonKey = columns.filter(
                      (key) => !keys[table].includes(key),
                    );
                  return q(
                    `INSERT INTO ${table}(${columns.join(",")}) VALUES(${columns.map(() => "?").join(",")}) ON CONFLICT(${keys[table].join(",")}) DO ${mutable && nonKey.length ? "UPDATE SET " + nonKey.map((k) => `${k}=excluded.${k}`).join(",") : "NOTHING"}`,
                    ...data,
                  );
                });
                await to.query(queries);
                job.cursor += rows.length;
                job.copied += rows.length;
                job.last_keys = keys[table].map(
                  (key) => rows[rows.length - 1][key],
                );
              } else {
                job.source_counts[table] = job.cursor;
                job.table++;
                job.cursor = 0;
                job.last_keys = undefined;
                if (job.table === tables.length) {
                  job.phase = "validating";
                  job.table = 0;
                }
              }
            } else {
              if (table === "officials" && rows.length)
                await to.query(
                  rows.map((row) =>
                    q(
                      "UPDATE officials SET manager_id=? WHERE id=?",
                      row.manager_id,
                      row.id,
                    ),
                  ),
                );
              const dest = (await to.query([pageQuery]))[0].results;
              if ((await fingerprint(rows)) !== (await fingerprint(dest)))
                throw new Error(
                  "Copied rows did not match during verification.",
                );
              if (!rows.length) {
                job.table++;
                job.cursor = 0;
                job.last_keys = undefined;
              } else {
                job.cursor += rows.length;
                job.last_keys = keys[table].map(
                  (key) => rows[rows.length - 1][key],
                );
              }
            }
          }),
        );
        job.message =
          (job.phase === "copying" ? "Copying " : "Verifying ") +
          table +
          "; " +
          job.copied +
          " records copied.";
        await this.ctx.storage.put("job", job);
        await this.ctx.storage.setAlarm(Date.now() + 100);
      } catch {
        const published = await this.env.DB.prepare(
          "SELECT * FROM database_route WHERE id=1",
        ).first<Route>();
        if (published?.active_id === job.target) {
          this.route = published;
          job.phase = "complete";
          job.message =
            "Database activated. New requests use the destination; the previous connection is retained.";
          await this.ctx.storage.put("job", job);
          return;
        }
        job.phase = "failed";
        job.message =
          "Transfer or verification failed. The original connection remains active. Partial destination records were retained; review credentials and the destination before retrying.";
        this.route.maintenance = 0;
        await this.saveRoute();
        await this.ctx.storage.put("job", job);
      }
    });
  }
  private async finish(target: Profile) {
    await this.validate(target);
    // Publication happens only after all chunks were verified. The old route survives any earlier failure.
    // Delivery configuration belongs to the control store, not a prepared dataset.
    const fixed = await this.env.DB.batch([
      this.env.DB.prepare("SELECT * FROM runtime_settings"),
      this.env.DB.prepare("SELECT * FROM secret_store"),
    ]);
    await this.using(target, async (connection) => {
      const statements: Query[] = [];
      for (const [table, records, conflict] of [
        ["runtime_settings", fixed[0].results, ["is_demo"]],
        ["secret_store", fixed[1].results, ["is_demo", "name"]],
      ] as const)
        for (const unknownRow of records) {
          const row = unknownRow as Record<string, unknown>,
            cols = Object.keys(row);
          statements.push(
            q(
              `INSERT INTO ${table}(${cols.join(",")}) VALUES(${cols.map(() => "?").join(",")}) ON CONFLICT(${conflict.join(",")}) DO UPDATE SET ${cols
                .filter((c) => !(conflict as readonly string[]).includes(c))
                .map((c) => `${c}=excluded.${c}`)
                .join(",")}`,
              ...cols.map((c) => row[c]),
            ),
          );
        }
      if (statements.length) await connection.query(statements);
    });
    const previous = this.route.active_id,
      stamp = now();
    await this.env.DB.prepare(
      "UPDATE database_route SET active_id=?,previous_id=?,maintenance=0,updated_at=? WHERE id=1",
    )
      .bind(target.id, previous, stamp)
      .run();
    this.route = {
      active_id: target.id,
      previous_id: previous,
      maintenance: 0,
      updated_at: stamp,
    };
    this.job!.phase = "complete";
    this.job!.message =
      "Database activated. New requests use " +
      target.name +
      ". Previous database retained.";
    await this.ctx.storage.put("job", this.job);
    await this.env.DB.prepare(
      "INSERT INTO database_control_audit(id,actor_id,action,detail,created_at) VALUES(?,?,?,?,?)",
    )
      .bind(
        id("database-audit"),
        "system",
        "database_activated",
        target.name,
        now(),
      )
      .run();
  }
}
export default {
  fetch(request: Request, env: DatabaseEnv) {
    if (request.headers.get("x-internal-secret") !== env.INTERNAL_SECRET)
      return json({ error: "Private database service." }, 403);
    return env.ROUTER.get(env.ROUTER.idFromName("application")).fetch(request);
  },
} satisfies ExportedHandler<DatabaseEnv>;
