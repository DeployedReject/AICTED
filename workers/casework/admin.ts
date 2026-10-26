import type { Official } from "../../packages/shared/types";
import type { Env } from "../shared";
import { body, fail, json, now, textField, userColumns } from "../shared";
export async function admin(request: Request, env: Env, user: Official) {
  if (user.role !== "it") fail(403, "IT administration access is required.");
  const db = env.DB;
  if (request.method === "GET") {
    const [settings, officials] = await Promise.all([
      db
        .prepare(
          "SELECT support_email,sender_email,updated_at FROM workspace_settings WHERE is_demo=?",
        )
        .bind(user.is_demo)
        .first(),
      db
        .prepare(
          `SELECT ${userColumns} FROM officials WHERE is_demo=? AND active=1 ORDER BY name LIMIT 100`,
        )
        .bind(user.is_demo)
        .all(),
    ]);
    return json({
      settings: settings || { support_email: "", sender_email: "" },
      officials: officials.results,
    });
  }
  if (request.method !== "POST") fail(405, "Method not allowed.");
  const input = await body(request);
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
    if (!target || target.role === "it" || target.id === "0000")
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
    await db
      .prepare(
        "UPDATE officials SET role=?,manager_id=? WHERE id=? AND is_demo=?",
      )
      .bind(input.role, managerId, officialId, user.is_demo)
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
