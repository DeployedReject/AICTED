import type { Official } from "../../packages/shared/types";
import type { Env } from "../shared";
import { fail, id, json, now, textField } from "../shared";
import { getSecret, seal } from "../vault";
import { runtime } from "../runtime";
import { passwordHash } from "../auth";
const email = (value: unknown, required = false) => {
  const result = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (
    (required && !result) ||
    (result && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result)) ||
    result.length > 254
  )
    fail(400, "Enter a valid email address.");
  return result;
};
const flag = (value: unknown) =>
  value === true || value === 1 || value === "1" || value === "on" ? 1 : 0;
const allowedSecrets = ["email_resend", "email_sendgrid", "postgres_password"];
function audit(env: Env, user: Official, action: string, detail: string) {
  return env.DB.prepare(
    "INSERT INTO admin_audit(id,actor_id,action,detail,created_at,is_demo) VALUES(?,?,?,?,?,?)",
  ).bind(id("audit"), user.id, action, detail, now(), user.is_demo);
}
export async function production(
  input: Record<string, unknown>,
  env: Env,
  user: Official,
): Promise<Response | null> {
  const action = String(input.action || "");
  if (action === "secret_reveal" || action === "secret_delete") {
    const name = String(input.name);
    if (user.is_demo)
      fail(403, "Use a production IT account to access credentials.");
    if (!allowedSecrets.includes(name)) fail(400, "Unknown secret.");
    if (action === "secret_delete") {
      await env.DB.batch([
        env.DB.prepare(
          "DELETE FROM secret_store WHERE is_demo=? AND name=?",
        ).bind(user.is_demo, name),
        audit(env, user, "secret_deleted", name),
      ]);
      await mirrorConfiguration(env, user);
      return json({ ok: true });
    }
    const value = await getSecret(env, user.is_demo, name);
    await audit(env, user, "secret_revealed", name).run();
    return json({ value: value || "" });
  }
  if (action === "secret_save") {
    if (user.is_demo)
      fail(403, "Use a production IT account to save credentials.");
    const name = String(input.name);
    if (!allowedSecrets.includes(name)) fail(400, "Unknown secret.");
    const value = textField(input.value, "Secret", 4000);
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO secret_store(is_demo,name,ciphertext,last_four,updated_at,updated_by) VALUES(?,?,?,?,?,?) ON CONFLICT(is_demo,name) DO UPDATE SET ciphertext=excluded.ciphertext,last_four=excluded.last_four,updated_at=excluded.updated_at,updated_by=excluded.updated_by",
      ).bind(
        user.is_demo,
        name,
        await seal(env, value, `${user.is_demo}:${name}`),
        value.slice(-4),
        now(),
        user.id,
      ),
      audit(env, user, "secret_saved", name),
    ]);
    await mirrorConfiguration(env, user);
    return json({ ok: true });
  }
  if (action === "email" || action === "server") {
    const cfg = await runtime(env, user.is_demo);
    const pending: D1PreparedStatement[] = [];
    if (action === "server") {
      cfg.site_name = textField(input.site_name, "Name", 80);
      const url = new URL(textField(input.public_url, "Site URL", 250));
      if (
        url.protocol !== "https:" ||
        url.username ||
        url.password ||
        url.search ||
        url.hash
      )
        fail(
          400,
          "Use an HTTPS site URL without credentials, query or fragment.",
        );
      cfg.public_url = url.origin;
      cfg.session_hours = Number(input.session_hours);
      cfg.reminder_days = Number(input.reminder_days);
      if (
        !Number.isInteger(cfg.session_hours) ||
        cfg.session_hours < 1 ||
        cfg.session_hours > 24 ||
        !Number.isInteger(cfg.reminder_days) ||
        cfg.reminder_days < 1 ||
        cfg.reminder_days > 30
      )
        fail(400, "Choose 1–24 session hours and 1–30 reminder days.");
    } else {
      if (!["resend", "sendgrid"].includes(String(input.provider)))
        fail(400, "Choose an email provider.");
      cfg.provider = input.provider as "resend" | "sendgrid";
      cfg.sender_name = textField(input.sender_name, "Sender name", 80);
      cfg.support_email = email(input.support_email);
      cfg.recovery_sender = email(input.recovery_sender);
      cfg.updates_sender = email(input.updates_sender);
      cfg.reply_to = email(input.reply_to);
      cfg.recovery_enabled = flag(input.recovery_enabled);
      cfg.updates_enabled = flag(input.updates_enabled);
      cfg.reminders_enabled = flag(input.reminders_enabled);
      cfg.daily_email_limit = Number(input.daily_email_limit);
      if (
        !Number.isInteger(cfg.daily_email_limit) ||
        cfg.daily_email_limit < 1 ||
        cfg.daily_email_limit > 1000
      )
        fail(400, "Choose a daily email limit between 1 and 1000.");
      const incoming =
        typeof input.api_key === "string" ? input.api_key.trim() : "";
      if (incoming && user.is_demo)
        fail(403, "Use a production IT account to save provider credentials.");
      if (incoming) {
        const value = textField(incoming, "API key", 4000, 16),
          name = `email_${cfg.provider}`;
        pending.push(
          env.DB.prepare(
            "INSERT INTO secret_store(is_demo,name,ciphertext,last_four,updated_at,updated_by) VALUES(?,?,?,?,?,?) ON CONFLICT(is_demo,name) DO UPDATE SET ciphertext=excluded.ciphertext,last_four=excluded.last_four,updated_at=excluded.updated_at,updated_by=excluded.updated_by",
          ).bind(
            user.is_demo,
            name,
            await seal(env, value, `${user.is_demo}:${name}`),
            value.slice(-4),
            now(),
            user.id,
          ),
          audit(env, user, "secret_saved", name),
        );
      }
      const configured = await env.DB.prepare(
        "SELECT name FROM secret_store WHERE is_demo=? AND name=?",
      )
        .bind(user.is_demo, `email_${cfg.provider}`)
        .first();
      if (
        (cfg.recovery_enabled ||
          cfg.updates_enabled ||
          cfg.reminders_enabled) &&
        ((!configured && !incoming) || !cfg.public_url)
      )
        fail(
          400,
          "Set the site URL and provider key before enabling delivery.",
        );
      if (cfg.recovery_enabled && !cfg.recovery_sender)
        fail(400, "Set the recovery sender.");
      if ((cfg.updates_enabled || cfg.reminders_enabled) && !cfg.updates_sender)
        fail(400, "Set the updates sender.");
    }
    await env.DB.batch([
      ...pending,
      env.DB.prepare(
        "INSERT INTO runtime_settings(is_demo,site_name,public_url,support_email,provider,sender_name,recovery_sender,updates_sender,reply_to,recovery_enabled,updates_enabled,reminders_enabled,daily_email_limit,reminder_days,session_hours,updated_at,updated_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(is_demo) DO UPDATE SET site_name=excluded.site_name,public_url=excluded.public_url,support_email=excluded.support_email,provider=excluded.provider,sender_name=excluded.sender_name,recovery_sender=excluded.recovery_sender,updates_sender=excluded.updates_sender,reply_to=excluded.reply_to,recovery_enabled=excluded.recovery_enabled,updates_enabled=excluded.updates_enabled,reminders_enabled=excluded.reminders_enabled,daily_email_limit=excluded.daily_email_limit,reminder_days=excluded.reminder_days,session_hours=excluded.session_hours,updated_at=excluded.updated_at,updated_by=excluded.updated_by",
      ).bind(
        user.is_demo,
        cfg.site_name,
        cfg.public_url,
        cfg.support_email,
        cfg.provider,
        cfg.sender_name,
        cfg.recovery_sender,
        cfg.updates_sender,
        cfg.reply_to,
        cfg.recovery_enabled,
        cfg.updates_enabled,
        cfg.reminders_enabled,
        cfg.daily_email_limit,
        cfg.reminder_days,
        cfg.session_hours,
        now(),
        user.id,
      ),
      audit(env, user, action + "_configured", "Settings updated"),
    ]);
    await mirrorConfiguration(env, user);
    return json({ ok: true });
  }
  if (action === "email_verification") {
    if (user.is_demo) fail(403, "Demo accounts cannot send email.");
    if (!env.NOTIFICATIONS)
      fail(503, "The notifications service is unavailable.");
    return env.NOTIFICATIONS.fetch(
      new Request("https://private/verification", {
        method: "POST",
        headers: {
          "x-internal-secret": env.INTERNAL_SECRET,
          "x-actor": JSON.stringify(user),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ sender: input.sender }),
      }),
    );
  }
  if (action === "create_account") {
    const accountId = textField(input.id, "ID", 80),
      name = textField(input.name, "Name", 120),
      designation = textField(input.designation, "Designation", 80),
      bureau = textField(input.bureau, "Bureau", 80),
      role = String(input.role),
      address = email(input.email, !user.is_demo);
    if (
      ["0000", "0001"].includes(accountId) ||
      accountId === "DEMO-IT" ||
      (!user.is_demo && accountId.startsWith("DEMO-"))
    )
      fail(400, "Choose a production ID without a DEMO prefix.");
    if (!["official", "manager", "it"].includes(role))
      fail(400, "Choose a role.");
    if (
      !(await env.DB.prepare(
        "SELECT code FROM org_units WHERE code=? AND active=1",
      )
        .bind(bureau)
        .first())
    )
      fail(400, "Choose an active Bureau or Cell.");
    const reportScope =
      role === "manager" ? String(input.report_scope || "team") : "personal";
    if (!["personal", "team", "bureau"].includes(reportScope))
      fail(400, "Choose report access.");
    const managerId =
      role !== "it" && input.manager_id
        ? textField(input.manager_id, "Manager", 80)
        : null;
    if (
      managerId &&
      !(await env.DB.prepare(
        "SELECT id FROM officials WHERE id=? AND is_demo=? AND active=1 AND role='manager' AND bureau=?",
      )
        .bind(managerId, user.is_demo, bureau)
        .first())
    )
      fail(400, "Choose a manager from the same Bureau.");
    const salt = crypto.randomUUID().replaceAll("-", "");
    const password = user.is_demo
      ? null
      : textField(input.password, "Initial password", 128, 12);
    const hash = password ? await passwordHash(password, salt) : null;
    if (
      await env.DB.prepare("SELECT id FROM officials WHERE id=?")
        .bind(accountId)
        .first()
    )
      fail(409, "This ID already exists.");
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO officials(id,name,designation,bureau,role,manager_id,is_demo,email,password_salt,password_hash,report_scope) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
      ).bind(
        accountId,
        name,
        designation,
        bureau,
        role,
        managerId,
        user.is_demo,
        address,
        hash ? salt : null,
        hash,
        reportScope,
      ),
      audit(env, user, "account_created", accountId),
    ]);
    if (
      role === "it" &&
      env.CONTROL_DB &&
      !env.DB_GENERATION?.value?.startsWith("original:")
    ) {
      await env.CONTROL_DB.prepare(
        "INSERT INTO officials(id,name,designation,bureau,role,manager_id,is_demo,email,password_salt,password_hash,report_scope) VALUES(?,?,?,?,?,NULL,?,?,?,?,?)",
      )
        .bind(
          accountId,
          name,
          designation,
          bureau,
          role,
          user.is_demo,
          address,
          hash ? salt : null,
          hash,
          reportScope,
        )
        .run();
    }
    return json({ ok: true }, 201);
  }
  if (action === "account_email") {
    const accountId = textField(input.official_id, "Official", 80);
    if (
      !(await env.DB.prepare(
        "SELECT id FROM officials WHERE id=? AND is_demo=?",
      )
        .bind(accountId, user.is_demo)
        .first())
    )
      fail(404, "Official not found.");
    await env.DB.batch([
      env.DB.prepare(
        "UPDATE officials SET email=? WHERE id=? AND is_demo=?",
      ).bind(email(input.email, true), accountId, user.is_demo),
      audit(env, user, "email_updated", accountId),
    ]);
    if (env.CONTROL_DB)
      await env.CONTROL_DB.prepare(
        "UPDATE officials SET email=? WHERE id=? AND role='it'",
      )
        .bind(email(input.email, true), accountId)
        .run();
    return json({ ok: true });
  }
  if (action === "account_access") {
    const accountId = textField(input.official_id, "Official", 80);
    if (
      accountId === user.id ||
      ["0000", "0001"].includes(accountId) ||
      accountId === "DEMO-IT"
    )
      fail(400, "This account cannot be disabled here.");
    const target = await env.DB.prepare(
      "SELECT id,role FROM officials WHERE id=? AND is_demo=?",
    )
      .bind(accountId, user.is_demo)
      .first<{ id: string; role: string }>();
    if (!target) fail(404, "Official not found.");
    const active = flag(input.active);
    await env.DB.batch([
      env.DB.prepare(
        "UPDATE officials SET active=? WHERE id=? AND is_demo=?",
      ).bind(active, accountId, user.is_demo),
      env.DB.prepare("DELETE FROM sessions WHERE official_id=?").bind(
        accountId,
      ),
      audit(
        env,
        user,
        "access_updated",
        `${accountId}: ${active ? "enabled" : "disabled"}`,
      ),
    ]);
    if (target.role === "it" && env.CONTROL_DB)
      await env.CONTROL_DB.batch([
        env.CONTROL_DB.prepare("UPDATE officials SET active=? WHERE id=?").bind(
          active,
          accountId,
        ),
        env.CONTROL_DB.prepare("DELETE FROM sessions WHERE official_id=?").bind(
          accountId,
        ),
      ]);
    return json({ ok: true });
  }
  if (action === "unit") {
    if (user.is_demo)
      fail(
        403,
        "A production administrator must update the organisation catalogue.",
      );
    const code = textField(input.code, "Code", 30),
      name = textField(input.name, "Name", 150);
    if (!/^[A-Z0-9_]+$/.test(code)) fail(400, "Use an uppercase unit code.");
    const type = String(input.unit_type);
    if (!["Bureau", "Cell", "Programme"].includes(type))
      fail(400, "Choose a unit type.");
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO org_units(code,name,unit_type,active,verification) VALUES(?,?,?,?,?) ON CONFLICT(code) DO UPDATE SET name=excluded.name,unit_type=excluded.unit_type,active=excluded.active,verification=excluded.verification",
      ).bind(
        code,
        name,
        type,
        flag(input.active),
        input.verification === "verified" ? "verified" : "unverified",
      ),
      audit(env, user, "unit_updated", code),
    ]);
    return json({ ok: true });
  }
  return null;
}

// Retain delivery settings and IT recovery identities in the fixed control store.
// The active application also has runtime_settings for transactional email triggers.
async function mirrorConfiguration(env: Env, user: Official) {
  if (
    !env.CONTROL_DB ||
    !env.DB_GENERATION?.value ||
    env.DB_GENERATION.value.startsWith("original:")
  )
    return;
  const [settings, secrets] = await env.DB.batch([
    env.DB.prepare("SELECT * FROM runtime_settings WHERE is_demo=?").bind(
      user.is_demo,
    ),
    env.DB.prepare("SELECT * FROM secret_store WHERE is_demo=?").bind(
      user.is_demo,
    ),
  ]);
  const statements = [
    env.CONTROL_DB.prepare("DELETE FROM secret_store WHERE is_demo=?").bind(
      user.is_demo,
    ),
  ];
  for (const [table, rows, keys] of [
    ["runtime_settings", settings.results, ["is_demo"]],
    ["secret_store", secrets.results, ["is_demo", "name"]],
  ] as const)
    for (const unknownRow of rows) {
      const row = unknownRow as Record<string, unknown>;
      const columns = Object.keys(row);
      statements.push(
        env.CONTROL_DB.prepare(
          `INSERT INTO ${table}(${columns.join(",")}) VALUES(${columns.map(() => "?").join(",")}) ON CONFLICT(${keys.join(",")}) DO UPDATE SET ${columns
            .filter((c) => !(keys as readonly string[]).includes(c))
            .map((c) => `${c}=excluded.${c}`)
            .join(",")}`,
        ).bind(...columns.map((c) => row[c])),
      );
    }
  await env.CONTROL_DB.batch(statements);
}
