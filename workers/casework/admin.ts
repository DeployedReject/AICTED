import type { Official } from "../../packages/shared/types";
import type { Env } from "../shared";
import { body, fail, json, now, id, textField, userColumns } from "../shared";
import { production } from "./production";
import { runtime } from "../runtime";
export async function admin(request: Request, env: Env, user: Official) {
  if (user.role !== "it") fail(403, "IT administration access is required.");
  const db = env.DB;
  const control = env.CONTROL_DB || db;
  const url = new URL(request.url);
  if (url.pathname === "/api/admin/tag-cases" && request.method === "GET") {
    const kind = url.searchParams.get("kind"),
      key = textField(url.searchParams.get("id"), "Tag", 100),
      cursor = (url.searchParams.get("cursor") || "").slice(0, 100);
    if (kind !== "case" && kind !== "institution")
      fail(400, "Choose a case tag or institution.");
    const condition =
      kind === "institution"
        ? "c.institution_id=?"
        : "EXISTS(SELECT 1 FROM json_each(c.tags) j WHERE j.value=?)";
    const result = await db
      .prepare(
        `SELECT c.id,c.subject,c.status,c.intake FROM cases c WHERE c.is_demo=? AND ${condition} AND c.id>? ORDER BY c.id LIMIT 21`,
      )
      .bind(user.is_demo, key, cursor)
      .all<{ id: string; subject: string; status: string; intake: string }>();
    return json({
      cases: result.results.slice(0, 20),
      next: result.results.length > 20 ? result.results[19].id : null,
    });
  }
  if (
    url.pathname === "/api/admin/tag-institutions" &&
    request.method === "GET"
  ) {
    const query = (url.searchParams.get("q") || "").trim().slice(0, 100);
    if (query && query.length < 2)
      return json({ institutions: [], more: false });
    const prefix = query.replace(/[\\%_]/g, "\\$&") + "%";
    const result = await db
      .prepare(
        "WITH counts AS (SELECT institution_id,COUNT(*) case_count FROM cases WHERE is_demo=? GROUP BY institution_id) SELECT i.id,i.name,i.permanent_id,COALESCE(counts.case_count,0) case_count FROM institutions i LEFT JOIN counts ON counts.institution_id=i.id WHERE i.is_demo=? AND (i.name LIKE ? ESCAPE '\\' OR i.permanent_id LIKE ? ESCAPE '\\') ORDER BY case_count DESC,i.name,i.id LIMIT 21",
      )
      .bind(user.is_demo, user.is_demo, prefix, prefix)
      .all();
    return json({
      institutions: result.results.slice(0, 20),
      more: result.results.length > 20,
    });
  }
  if (url.pathname === "/api/admin/tags") {
    if (request.method === "GET") {
      const result = await db
        .prepare(
          "WITH counts AS (SELECT j.value code,COUNT(DISTINCT c.id) case_count FROM cases c,json_each(c.tags) j WHERE c.is_demo=? GROUP BY j.value) SELECT t.code,t.label,t.group_name,t.active,t.source,COALESCE(counts.case_count,0) case_count FROM tags t LEFT JOIN counts ON counts.code=t.code WHERE t.is_demo=? ORDER BY t.active DESC,t.group_name,t.label LIMIT 201",
        )
        .bind(user.is_demo, user.is_demo)
        .all();
      return json({ tags: result.results });
    }
    if (request.method !== "POST") fail(405, "Method not allowed.");
    const input = await body(request),
      code = textField(input.code, "Tag code", 40),
      label = textField(input.label, "Tag name", 120),
      group = textField(input.group_name, "Category group", 80),
      active = input.active === "1" || input.active === true ? 1 : 0;
    if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(code))
      fail(
        400,
        "Use letters, numbers, hyphens or underscores for the tag code.",
      );
    const result = await db.batch([
      db
        .prepare(
          "INSERT INTO tags(code,label,group_name,active,source,is_demo) SELECT ?,?,?,?,'custom',? WHERE (EXISTS(SELECT 1 FROM tags WHERE code=? AND is_demo=?) OR (SELECT COUNT(*) FROM tags WHERE is_demo=?)<200) AND (?=0 OR (SELECT COUNT(*) FROM tags WHERE is_demo=? AND active=1 AND code<>?)<100) ON CONFLICT(code,is_demo) DO UPDATE SET label=excluded.label,group_name=excluded.group_name,active=excluded.active,source='custom'",
        )
        .bind(
          code,
          label,
          group,
          active,
          user.is_demo,
          code,
          user.is_demo,
          user.is_demo,
          active,
          user.is_demo,
          code,
        ),
      db
        .prepare(
          "INSERT INTO admin_audit(id,actor_id,action,detail,created_at,is_demo) SELECT ?,?,'case_tag_updated',?,?,? WHERE EXISTS(SELECT 1 FROM tags WHERE code=? AND is_demo=? AND label=? AND group_name=? AND active=?)",
        )
        .bind(
          id("audit"),
          user.id,
          code + " · " + label,
          now(),
          user.is_demo,
          code,
          user.is_demo,
          label,
          group,
          active,
        ),
    ]);
    if (!result[0].meta.changes)
      fail(
        400,
        "The catalogue supports 100 active tags and 200 total tags. Deactivate an unused tag first.",
      );
    return json({ ok: true });
  }
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
          )} FROM official_search JOIN officials o ON o.rowid=official_search.rowid WHERE official_search MATCH ? AND o.is_demo=? AND o.role<>'it' ${role ? "AND o.role='manager'" : ""} ${bureau ? "AND o.bureau=?" : ""} ORDER BY rank LIMIT 21`,
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
      .prepare(`SELECT ${userColumns} FROM officials WHERE id=? AND is_demo=?`)
      .bind(officialId, user.is_demo)
      .first<Official>();
    if (!target || target.role === "it" || ["0000", "0001"].includes(target.id))
      fail(400, "This account cannot be changed here.");
    const bureau = input.bureau
      ? textField(input.bureau, "Bureau", 80)
      : target.bureau;
    const designation = input.designation
      ? textField(input.designation, "Designation", 80)
      : target.designation;
    const name = input.name ? textField(input.name, "Name", 120) : target.name;
    const active = input.active === "0" || input.active === false ? 0 : 1;
    if (
      !(await db
        .prepare("SELECT code FROM org_units WHERE code=? AND active=1")
        .bind(bureau)
        .first())
    )
      fail(400, "Choose an active bureau.");
    if (bureau !== target.bureau || !active) {
      if (
        await db
          .prepare(
            "SELECT id FROM cases WHERE assigned_to=? AND status<>'Disposed' AND intake IN('Submitted','Approved','Returned') LIMIT 1",
          )
          .bind(officialId)
          .first()
      )
        fail(
          409,
          "Reassign open cases before moving or disabling this official.",
        );
      if (
        await db
          .prepare(
            "SELECT id FROM officials WHERE manager_id=? AND active=1 LIMIT 1",
          )
          .bind(officialId)
          .first()
      )
        fail(
          409,
          "Reassign the reporting team before moving or disabling this manager.",
        );
      if (
        await db
          .prepare(
            "SELECT approver_id FROM institution_routing WHERE approver_id=? LIMIT 1",
          )
          .bind(officialId)
          .first()
      )
        fail(
          409,
          "Choose another institution intake manager before moving or disabling this account.",
        );
    }
    if (managerId) {
      const manager = await db
        .prepare(
          `SELECT ${userColumns} FROM officials WHERE id=? AND is_demo=? AND active=1 AND role='manager'`,
        )
        .bind(managerId, user.is_demo)
        .first<Official>();
      if (!manager || manager.bureau !== bureau || manager.id === officialId)
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
    await db.batch([
      db
        .prepare("UPDATE password_resets SET used=1 WHERE official_id=?")
        .bind(officialId),
      db
        .prepare(
          "UPDATE officials SET role=?,manager_id=?,report_scope=?,name=?,designation=?,bureau=?,active=? WHERE id=? AND is_demo=?",
        )
        .bind(
          input.role,
          managerId,
          reportAccess,
          name,
          designation,
          bureau,
          active,
          officialId,
          user.is_demo,
        ),
      db.prepare("DELETE FROM sessions WHERE official_id=?").bind(officialId),
      db
        .prepare(
          "INSERT INTO admin_audit(id,actor_id,action,detail,created_at,is_demo) VALUES(?,?,'official_access_updated',?,?,?)",
        )
        .bind(id("audit"), user.id, officialId, now(), user.is_demo),
    ]);
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
