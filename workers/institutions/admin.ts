import type { Env } from "../shared";
import type { Official } from "../../packages/shared/types";
import { body, fail, id, json, now, textField } from "../shared";
import { passwordHash } from "../auth";
export async function institutionAdmin(
  request: Request,
  env: Env,
  user: Official,
) {
  if (user.role !== "it") fail(403, "Administration access is required.");
  const db = env.DB,
    url = new URL(request.url),
    path = url.pathname;
  if (path === "/api/admin/institution-records") {
    if (request.method === "GET") {
      const q = (url.searchParams.get("q") || "").trim().slice(0, 100),
        prefix = q.replace(/[\\%_]/g, "\\$&") + "%";
      const result = await db
        .prepare(
          "SELECT * FROM institutions WHERE is_demo=? AND (name LIKE ? ESCAPE '\\' OR permanent_id LIKE ? ESCAPE '\\') ORDER BY name,id LIMIT 21",
        )
        .bind(user.is_demo, prefix, prefix)
        .all();
      return json({
        institutions: result.results.slice(0, 20),
        more: result.results.length > 20,
      });
    }
    if (request.method !== "POST") fail(405, "Method not allowed.");
    const input = await body(request),
      existingId = typeof input.id === "string" ? input.id : "",
      institutionId = existingId || id(user.is_demo ? "DEMO-INST" : "INST");
    if (
      existingId &&
      !(await db
        .prepare("SELECT id FROM institutions WHERE id=? AND is_demo=?")
        .bind(existingId, user.is_demo)
        .first())
    )
      fail(404, "Institution not found.");
    if (
      !existingId &&
      user.is_demo &&
      Number(
        (
          await db
            .prepare("SELECT COUNT(*) n FROM institutions WHERE is_demo=1")
            .first<{ n: number }>()
        )?.n,
      ) >= 100
    )
      fail(429, "The test institution limit has been reached.");
    const fields = [
      textField(input.name, "Institution name", 180),
      textField(input.permanent_id, "Permanent ID", 80),
      textField(input.city, "City", 80),
      textField(input.state, "State", 80),
      textField(input.region, "Region", 80),
      textField(input.address, "Full address", 500),
      typeof input.district === "string"
        ? input.district.trim().slice(0, 100)
        : "",
      typeof input.postal_code === "string"
        ? input.postal_code.trim().slice(0, 20)
        : "",
      typeof input.aishe_code === "string"
        ? input.aishe_code.trim().slice(0, 50)
        : "",
      input.active === "0" || input.active === false ? 0 : 1,
    ];
    await db.batch([
      db
        .prepare(
          "INSERT INTO institutions(id,name,permanent_id,city,state,region,address,district,postal_code,aishe_code,active,is_demo) VALUES(?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,permanent_id=excluded.permanent_id,city=excluded.city,state=excluded.state,region=excluded.region,address=excluded.address,district=excluded.district,postal_code=excluded.postal_code,aishe_code=excluded.aishe_code,active=excluded.active",
        )
        .bind(institutionId, ...fields, user.is_demo),
      db
        .prepare(
          "INSERT INTO admin_audit(id,actor_id,action,detail,created_at,is_demo) VALUES(?,?,'institution_saved',?,?,?)",
        )
        .bind(id("audit"), user.id, institutionId, now(), user.is_demo),
    ]);
    return json({ ok: true, id: institutionId });
  }
  if (path === "/api/admin/institution-accounts") {
    if (request.method === "GET") {
      const query = (url.searchParams.get("q") || "").trim().slice(0, 100),
        prefix = query.replace(/[\\%_]/g, "\\$&") + "%";
      const result = await db
        .prepare(
          "SELECT a.id,a.institution_id,a.name,a.email,a.active,i.name institution_name,i.permanent_id FROM institution_accounts a JOIN institutions i ON i.id=a.institution_id WHERE a.is_demo=? AND (a.id LIKE ? ESCAPE '\\' OR a.name LIKE ? ESCAPE '\\' OR i.name LIKE ? ESCAPE '\\') ORDER BY a.name LIMIT 21",
        )
        .bind(user.is_demo, prefix, prefix, prefix)
        .all();
      return json({
        accounts: result.results.slice(0, 20),
        more: result.results.length > 20,
      });
    }
    if (request.method !== "POST") fail(405, "Method not allowed.");
    const input = await body(request),
      accountId = textField(input.id, "Account ID", 80),
      institutionId = textField(input.institution_id, "Institution", 100),
      name = textField(input.name, "Name", 120),
      email = textField(input.email, "Email", 254);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      fail(400, "Enter a valid email.");
    if (accountId === "0002")
      fail(403, "The shared test institution account cannot be changed.");
    if (
      !(await db
        .prepare(
          "SELECT id FROM institutions WHERE id=? AND is_demo=? AND active=1",
        )
        .bind(institutionId, user.is_demo)
        .first())
    )
      fail(400, "Choose an active institution from this dataset.");
    const existing = await db
      .prepare(
        "SELECT institution_id,is_demo FROM institution_accounts WHERE id=?",
      )
      .bind(accountId)
      .first<{ institution_id: string; is_demo: number }>();
    if (
      existing &&
      (existing.is_demo !== user.is_demo ||
        existing.institution_id !== institutionId)
    )
      fail(
        400,
        "An account cannot be moved to another institution. Create a new account instead.",
      );
    if (
      !existing &&
      user.is_demo &&
      Number(
        (
          await db
            .prepare(
              "SELECT COUNT(*) n FROM institution_accounts WHERE is_demo=1",
            )
            .first<{ n: number }>()
        )?.n,
      ) >= 20
    )
      fail(429, "The test account limit has been reached.");
    const password = typeof input.password === "string" ? input.password : "";
    if (!existing && !password) fail(400, "Set the initial password.");
    if (password && password.length < 12)
      fail(400, "Use at least 12 characters for the password.");
    const active = input.active === "0" || input.active === false ? 0 : 1,
      stamp = now(),
      statements: D1PreparedStatement[] = [];
    if (!existing || password) {
      const salt = crypto.randomUUID().replaceAll("-", "");
      const hash = await passwordHash(password, salt);
      statements.push(
        db
          .prepare(
            "INSERT INTO institution_accounts(id,institution_id,name,email,password_hash,password_salt,active,is_demo,created_at) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,email=excluded.email,password_hash=excluded.password_hash,password_salt=excluded.password_salt,active=excluded.active",
          )
          .bind(
            accountId,
            institutionId,
            name,
            email,
            hash,
            salt,
            active,
            user.is_demo,
            stamp,
          ),
      );
    } else
      statements.push(
        db
          .prepare(
            "UPDATE institution_accounts SET name=?,email=?,active=? WHERE id=? AND is_demo=?",
          )
          .bind(name, email, active, accountId, user.is_demo),
      );
    statements.push(
      db
        .prepare(
          "UPDATE institution_password_resets SET used=1 WHERE account_id=?",
        )
        .bind(accountId),
      db
        .prepare("DELETE FROM institution_sessions WHERE account_id=?")
        .bind(accountId),
      db
        .prepare(
          "INSERT INTO admin_audit(id,actor_id,action,detail,created_at,is_demo) VALUES(?,?,'institution_account_saved',?,?,?)",
        )
        .bind(id("audit"), user.id, accountId, stamp, user.is_demo),
    );
    await db.batch(statements);
    return json({ ok: true });
  }
  if (path === "/api/admin/institution-routing") {
    if (request.method === "GET") {
      const result = await db
        .prepare(
          "SELECT r.bureau,r.approver_id,o.name approver_name,u.name bureau_name FROM institution_routing r JOIN officials o ON o.id=r.approver_id JOIN org_units u ON u.code=r.bureau WHERE r.is_demo=? ORDER BY u.name",
        )
        .bind(user.is_demo)
        .all();
      return json({ routes: result.results });
    }
    if (request.method !== "POST") fail(405, "Method not allowed.");
    const input = await body(request),
      bureau = textField(input.bureau, "Bureau", 80),
      approver = textField(input.approver_id, "Intake manager", 80);
    if (
      !(await db
        .prepare(
          "SELECT o.id FROM officials o JOIN org_units u ON u.code=o.bureau WHERE o.id=? AND o.role='manager' AND o.active=1 AND o.bureau=? AND o.is_demo=? AND u.active=1",
        )
        .bind(approver, bureau, user.is_demo)
        .first())
    )
      fail(400, "Choose an active manager from that bureau.");
    await db.batch([
      db
        .prepare(
          "INSERT INTO institution_routing(is_demo,bureau,approver_id) VALUES(?,?,?) ON CONFLICT(is_demo,bureau) DO UPDATE SET approver_id=excluded.approver_id",
        )
        .bind(user.is_demo, bureau, approver),
      db
        .prepare(
          "INSERT INTO admin_audit(id,actor_id,action,detail,created_at,is_demo) VALUES(?,?,'institution_routing_saved',?,?,?)",
        )
        .bind(
          id("audit"),
          user.id,
          bureau + ": " + approver,
          now(),
          user.is_demo,
        ),
    ]);
    return json({ ok: true });
  }
  return fail(404, "Unknown institution administration action.");
}
