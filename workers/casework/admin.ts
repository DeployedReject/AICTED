import type { Official } from "../../packages/shared/types";
import type { Env } from "../shared";
import { body, fail, json, now, textField, userColumns } from "../shared";
import { production } from "./production";
import { runtime } from "../runtime";
export async function admin(request: Request, env: Env, user: Official) {
  if (user.role !== "it") fail(403, "IT administration access is required.");
  const db = env.DB;
  const control = env.CONTROL_DB || db;
  const url = new URL(request.url);
  if (url.pathname === "/api/admin/account" && request.method === "GET") {
    const account = await db
      .prepare(
        `SELECT ${userColumns},email,active FROM officials WHERE id=? AND is_demo=? AND role<>'it'`,
      )
      .bind((url.searchParams.get("id") || "").slice(0, 80), user.is_demo)
      .first();
    if (!account) fail(404, "Official not found.");
    return json({ official: account });
  }
  if (url.pathname === "/api/admin/officials" && request.method === "GET") {
    const query = (url.searchParams.get("q") || "").trim().slice(0, 80);
    if (query.length < 2) return json({ officials: [], more: false });
    const tokens = query.match(/[\p{L}\p{N}]+/gu)?.slice(0, 4) || [];
    if (!tokens.length) return json({ officials: [], more: false });
    const match = tokens.map((t) => '"' + t + '"*').join(" AND ");
    const role = url.searchParams.get("role") === "manager" ? "manager" : null;
    const bureau = (url.searchParams.get("bureau") || "").slice(0, 80);
    const rows = await db
      .prepare(
        `SELECT ${userColumns
          .split(",")
          .map((c) => "o." + c)
          .join(
            ",",
          )} FROM official_search JOIN officials o ON o.rowid=official_search.rowid WHERE official_search MATCH ? AND o.is_demo=? AND o.active=1 AND o.role<>'it' ${role ? "AND o.role='manager'" : ""} ${bureau ? "AND o.bureau=?" : ""} ORDER BY rank LIMIT 21`,
      )
      .bind(match, user.is_demo, ...(bureau ? [bureau] : []))
      .all();
    return json({
      officials: rows.results.slice(0, 20),
      more: rows.results.length > 20,
    });
  }

  if (request.method === "GET") {
    const section = url.searchParams.get("section") || "Accounts";
    const [officials, cfg, secrets, units, logs, accountEmail] =
      await Promise.all([
        section === "Accounts"
          ? db
              .prepare(
                `SELECT ${userColumns},email,active FROM officials WHERE is_demo=? ORDER BY name LIMIT 100`,
              )
              .bind(user.is_demo)
              .all()
          : Promise.resolve({ results: [] }),
        runtime(env, user.is_demo),
        control
          .prepare(
            "SELECT name,last_four,updated_at FROM secret_store WHERE is_demo=?",
          )
          .bind(user.is_demo)
          .all(),
        db
          .prepare(
            "SELECT code,name,unit_type,active,verification FROM org_units ORDER BY name",
          )
          .all(),
        section === "Server"
          ? db
              .prepare(
                "SELECT action,detail,created_at FROM admin_audit WHERE is_demo=? ORDER BY created_at DESC LIMIT 15",
              )
              .bind(user.is_demo)
              .all()
          : Promise.resolve({ results: [] }),
        db
          .prepare("SELECT email FROM officials WHERE id=?")
          .bind(user.id)
          .first<{ email: string }>(),
      ]);
    return json({
      officials: officials.results,
      runtime: cfg,
      secrets: secrets.results,
      units: units.results,
      logs: logs.results,
      account_email: accountEmail?.email || "",
      encryption_ready: !!env.CONFIG_KEY,
      is_demo: user.is_demo,
      current_id: user.id,
      current_database:
        section === "Server"
          ? await activeDatabase(env, user)
          : { name: "", type: "" },
    });
  }
  if (request.method !== "POST") fail(405, "Method not allowed.");
  const input = await body(request);
  const configured = await production(input, env, user);
  if (configured) return configured;
  if (input.action === "reporting") {
    const officialId = textField(input.official_id, "Official", 80),
      managerId = input.manager_id
        ? textField(input.manager_id, "Manager", 80)
        : null;
    if (!["manager", "official"].includes(String(input.role)))
      fail(400, "Choose official or manager.");
    const target = await db
      .prepare(
        `SELECT ${userColumns} FROM officials WHERE id=? AND is_demo=? AND active=1`,
      )
      .bind(officialId, user.is_demo)
      .first<Official>();
    if (!target || target.role === "it" || ["0000", "0001"].includes(target.id))
      fail(400, "This account cannot be changed here.");
    if (managerId) {
      const manager = await db
        .prepare(
          `SELECT ${userColumns} FROM officials WHERE id=? AND is_demo=? AND active=1 AND role='manager'`,
        )
        .bind(managerId, user.is_demo)
        .first<Official>();
      if (
        !manager ||
        manager.bureau !== target.bureau ||
        manager.id === officialId
      )
        fail(400, "Choose a manager from the same Bureau.");
      const cycle = await db
        .prepare(
          `WITH RECURSIVE chain(id) AS(SELECT ? UNION SELECT o.manager_id FROM officials o JOIN chain c ON c.id=o.id WHERE o.manager_id IS NOT NULL) SELECT id FROM chain WHERE id=?`,
        )
        .bind(managerId, officialId)
        .first();
      if (cycle) fail(400, "This reporting line would create a cycle.");
    }
    if (
      input.role === "official" &&
      (await db
        .prepare("SELECT id FROM officials WHERE manager_id=? LIMIT 1")
        .bind(officialId)
        .first())
    )
      fail(
        400,
        "Reassign this manager’s team before removing manager authority.",
      );
    const reportAccess =
      input.role === "official"
        ? "personal"
        : String(input.report_scope || "team");
    if (!["personal", "team", "bureau"].includes(reportAccess))
      fail(400, "Choose report access.");
    await db
      .prepare(
        "UPDATE officials SET role=?,manager_id=?,report_scope=? WHERE id=? AND is_demo=?",
      )
      .bind(input.role, managerId, reportAccess, officialId, user.is_demo)
      .run();
    return json({ ok: true });
  }
  if (input.action === "institution") {
    if (
      user.is_demo &&
      Number(
        (
          await db
            .prepare("SELECT COUNT(*) n FROM institutions WHERE is_demo=1")
            .first<{ n: number }>()
        )?.n,
      ) >= 50
    )
      fail(429, "The demo institution limit has been reached.");
    const institutionId =
      (user.is_demo ? "DEMO-" : "INST-") + crypto.randomUUID().slice(0, 8);
    await db
      .prepare(
        "INSERT INTO institutions(id,name,permanent_id,city,state,region,is_demo) VALUES(?,?,?,?,?,?,?)",
      )
      .bind(
        institutionId,
        textField(input.name, "Institution name", 180),
        textField(input.permanent_id, "Permanent ID", 80),
        textField(input.city, "City", 80),
        textField(input.state, "State", 80),
        textField(input.region, "Region", 80),
        user.is_demo,
      )
      .run();
    return json({ ok: true }, 201);
  }
  if (input.action === "settings") {
    const support =
        typeof input.support_email === "string"
          ? input.support_email.trim()
          : "",
      sender =
        typeof input.sender_email === "string" ? input.sender_email.trim() : "";
    if (
      [support, sender].some(
        (x) => x.length > 254 || (x && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x)),
      )
    )
      fail(400, "Enter valid email addresses.");
    await db
      .prepare(
        "INSERT INTO workspace_settings(is_demo,support_email,sender_email,updated_at,updated_by) VALUES(?,?,?,?,?) ON CONFLICT(is_demo) DO UPDATE SET support_email=excluded.support_email,sender_email=excluded.sender_email,updated_at=excluded.updated_at,updated_by=excluded.updated_by",
      )
      .bind(user.is_demo, support, sender, now(), user.id)
      .run();
    return json({ ok: true });
  }
  return fail(400, "Unknown administration action.");
}

async function activeDatabase(env: Env, user: Official) {
  if (!env.DATABASE) return { name: "aicted-workspace", type: "SQLite" };
  const response = await env.DATABASE.fetch(
    new Request("https://database/manage", {
      headers: {
        "x-internal-secret": env.INTERNAL_SECRET,
        "x-actor": JSON.stringify(user),
      },
    }),
  );
  if (!response.ok)
    return { name: "Unavailable", type: "Check Database settings" };
  const data = (await response.json()) as {
    active: { name: string; source: string };
  };
  return {
    name: data.active.name,
    type: data.active.source === "postgres" ? "PostgreSQL" : "SQLite",
  };
}
