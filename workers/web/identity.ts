import type { Env } from "../shared";
import type { Official } from "../../packages/shared/types";
import { body, fail, id, json, now, textField, userColumns } from "../shared";
import { passwordHash, sha, session } from "../auth";
import { runtime } from "../runtime";
export async function identity(
  request: Request,
  env: Env,
): Promise<Response | null> {
  const url = new URL(request.url),
    path = url.pathname;
  if (path === "/api/public-config" && request.method === "GET") {
    const cfg = await runtime(env, 0);
    return json({ site_name: cfg.site_name, support_email: cfg.support_email });
  }
  if (path === "/api/auth/setup" || path === "/api/auth/setup-status") {
    const user = await session(request, env);
    if (user.role !== "it")
      fail(
        403,
        "Sign in to IT administration before setting up an administrator account.",
      );
  }
  if (path === "/api/auth/setup-status" && request.method === "GET") {
    const row = await env.DB.prepare(
      "SELECT id FROM officials WHERE role='it' AND is_demo=0 LIMIT 1",
    ).first();
    return json({ available: !!env.BOOTSTRAP_TOKEN && !row });
  }
  if (
    !["/api/auth/setup", "/api/auth/recover", "/api/auth/reset"].includes(
      path,
    ) ||
    request.method !== "POST"
  )
    return null;
  if (
    env.AUTH_LIMITER &&
    !(
      await env.AUTH_LIMITER.limit({
        key: path + ":" + (request.headers.get("cf-connecting-ip") || "local"),
      })
    ).success
  )
    fail(429, "Please wait before trying again.");
  const input = await body(request);
  if (
    path === "/api/auth/reset" &&
    typeof input.token === "string" &&
    input.token.startsWith("it.")
  )
    env = { ...env, DB: env.CONTROL_DB || env.DB };
  if (path === "/api/auth/setup") {
    if (!env.BOOTSTRAP_TOKEN || input.setup_code !== env.BOOTSTRAP_TOKEN)
      fail(403, "The setup code is incorrect.");
    if (
      await env.DB.prepare(
        "SELECT id FROM officials WHERE role='it' AND is_demo=0 LIMIT 1",
      ).first()
    )
      fail(409, "Production setup is already complete.");
    const officialId = textField(input.id, "ID", 80),
      name = textField(input.name, "Name", 120),
      email = textField(input.email, "Email", 254).toLowerCase(),
      password = textField(input.password, "Password", 128, 12);
    if (officialId === "0000" || officialId.startsWith("DEMO-"))
      fail(400, "Choose a production account ID.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      fail(400, "Enter a valid email.");
    const salt = crypto.randomUUID().replaceAll("-", ""),
      stamp = now();
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO production_bootstrap(id,completed_at) VALUES(1,?)",
      ).bind(stamp),
      env.DB.prepare(
        "INSERT INTO officials(id,name,designation,bureau,role,is_demo,email,password_salt,password_hash) VALUES(?,?,'Technical Official','ADMIN','it',0,?,?,?)",
      ).bind(officialId, name, email, salt, await passwordHash(password, salt)),
      env.DB.prepare(
        "INSERT INTO runtime_settings(is_demo,site_name,public_url,support_email,updated_at,updated_by) VALUES(0,'AICTE',?,?,?,?) ON CONFLICT(is_demo) DO NOTHING",
      ).bind(url.origin, email, stamp, officialId),
      env.DB.prepare(
        "INSERT INTO admin_audit(id,actor_id,action,detail,created_at,is_demo) VALUES(?,?,?,?,?,0)",
      ).bind(
        id("audit"),
        officialId,
        "production_setup",
        "Initial production administrator created",
        stamp,
      ),
    ]);
    return json({ ok: true }, 201);
  }
  if (path === "/api/auth/recover") {
    const response = () =>
      json({
        ok: true,
        message:
          "If this account can receive recovery mail, a reset link will be sent.",
      });
    const address =
      typeof input.email === "string" ? input.email.trim().slice(0, 254) : "";
    const institutionPortal = input.portal === "institution";
    const controlIT =
      input.portal === "it"
        ? await (env.CONTROL_DB || env.DB)
            .prepare(
              `SELECT ${userColumns},email FROM officials WHERE email=? COLLATE NOCASE AND role='it' AND active=1 AND is_demo=0`,
            )
            .bind(address)
            .first<Official & { email: string }>()
        : null;
    if (controlIT) env = { ...env, DB: env.CONTROL_DB || env.DB };
    const institutionAccount = institutionPortal
      ? await env.DB.prepare(
          "SELECT a.id,a.name,a.email,a.is_demo,a.institution_id FROM institution_accounts a JOIN institutions i ON i.id=a.institution_id WHERE a.id=? AND a.email=? COLLATE NOCASE AND a.active=1 AND a.is_demo=0 AND i.active=1",
        )
          .bind(String(input.account_id || "").slice(0, 80), address)
          .first<Official & { email: string }>()
      : null;
    const user = institutionPortal
      ? institutionAccount && {
          ...institutionAccount,
          role: "institution" as const,
        }
      : controlIT ||
        (input.portal === "it"
          ? null
          : await env.DB.prepare(
              `SELECT ${userColumns},email FROM officials WHERE email=? COLLATE NOCASE AND active=1 AND is_demo=0 AND role<>'it'`,
            )
              .bind(address)
              .first<Official & { email: string }>());
    if (!user) return response();
    const resetTable = institutionPortal
        ? "institution_password_resets"
        : "password_resets",
      identityField = institutionPortal ? "account_id" : "official_id",
      usageTable = institutionPortal
        ? "institution_recovery_usage"
        : "recovery_usage";
    const cfg = await runtime(env, 0);
    if (!cfg.recovery_enabled || !env.NOTIFICATIONS) return response();
    const quota = await env.DB.prepare(
      `INSERT INTO ${usageTable}(${identityField},day,calls) VALUES(?,?,1) ON CONFLICT(${identityField},day) DO UPDATE SET calls=${usageTable}.calls+1 WHERE ${usageTable}.calls<3`,
    )
      .bind(user.id, now().slice(0, 10))
      .run();
    if (!quota.meta.changes) return response();
    const token =
        (user.role === "it" ? "it." : institutionPortal ? "institution." : "") +
        crypto.randomUUID() +
        crypto.randomUUID(),
      hash = await sha(token);
    await env.DB.batch([
      env.DB.prepare(
        `DELETE FROM ${resetTable} WHERE ${identityField}=? AND expires_at<?`,
      ).bind(user.id, Math.floor(Date.now() / 1000)),
      env.DB.prepare(
        `INSERT INTO ${resetTable}(token_hash,${identityField},expires_at) VALUES(?,?,?)`,
      ).bind(hash, user.id, Math.floor(Date.now() / 1000) + 1800),
    ]);
    try {
      const result = await env.NOTIFICATIONS.fetch(
        new Request("https://private/recovery", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-internal-secret": env.INTERNAL_SECRET,
            "x-actor": JSON.stringify(user),
            ...(env.DB_GENERATION?.value
              ? { "x-db-generation": env.DB_GENERATION.value }
              : {}),
          },
          body: JSON.stringify({ token, request_id: hash }),
        }),
      );
      if (!result.ok) {
        await env.DB.prepare(
          `UPDATE ${resetTable} SET used=1 WHERE token_hash=?`,
        )
          .bind(hash)
          .run();
        console.error("Recovery email was not accepted.");
      }
    } catch {
      await env.DB.prepare(`UPDATE ${resetTable} SET used=1 WHERE token_hash=?`)
        .bind(hash)
        .run();
      console.error("Recovery email service was unavailable.");
    }
    return response();
  }
  const token = textField(input.token, "Reset token", 150),
    password = textField(input.password, "Password", 128, 12),
    hash = await sha(token),
    clock = Math.floor(Date.now() / 1000);
  const institutionToken = token.startsWith("institution."),
    resetTable = institutionToken
      ? "institution_password_resets"
      : "password_resets",
    identityField = institutionToken ? "account_id" : "official_id",
    accountTable = institutionToken ? "institution_accounts" : "officials",
    sessionTable = institutionToken ? "institution_sessions" : "sessions";
  const reset = await env.DB.prepare(
    `SELECT ${identityField} official_id FROM ${resetTable} WHERE token_hash=? AND expires_at>? AND used=0`,
  )
    .bind(hash, clock)
    .first<{ official_id: string }>();
  if (!reset) fail(410, "This reset link has expired or already been used.");
  const salt = crypto.randomUUID().replaceAll("-", "");
  const results = await env.DB.batch([
    env.DB.prepare(
      `UPDATE ${accountTable} SET password_salt=?,password_hash=? WHERE id=? AND active=1 AND EXISTS(SELECT 1 FROM ${resetTable} WHERE token_hash=? AND used=0 AND expires_at>?)`,
    ).bind(
      salt,
      await passwordHash(password, salt),
      reset.official_id,
      hash,
      clock,
    ),
    env.DB.prepare(
      `DELETE FROM ${sessionTable} WHERE ${identityField}=? AND EXISTS(SELECT 1 FROM ${resetTable} WHERE token_hash=? AND used=0 AND expires_at>?)`,
    ).bind(reset.official_id, hash, clock),
    env.DB.prepare(
      `UPDATE ${resetTable} SET used=1 WHERE ${identityField}=?`,
    ).bind(reset.official_id),
  ]);
  if (!results[0].meta.changes)
    fail(410, "This reset link has expired or already been used.");
  if (institutionToken)
    return json({ ok: true, login: "/?portal=institution" });
  const user = await env.DB.prepare("SELECT role FROM officials WHERE id=?")
    .bind(reset.official_id)
    .first<{ role: string }>();
  return json({ ok: true, login: user?.role === "it" ? "/it" : "/" });
}
