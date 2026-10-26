import { applicationEnv } from "../database/client";
import type { Env } from "../shared";
import type { Official } from "../../packages/shared/types";
import { actor, body, fail, guard, json, now, userColumns } from "../shared";
import { getSecret } from "../vault";
import { runtime } from "../runtime";
import type { RuntimeConfig } from "../runtime";
import { readable } from "../casework/access";
async function send(
  env: Env,
  cfg: RuntimeConfig,
  to: string,
  from: string,
  subject: string,
  text: string,
  idempotency: string,
) {
  if (!to || !from) fail(400, "Sender and recipient addresses are required.");
  const key = await getSecret(env, 0, `email_${cfg.provider}`);
  if (!key) fail(503, "The email provider key is not configured.");
  const quota = await (env.CONTROL_DB || env.DB)
    .prepare(
      "INSERT INTO mail_daily(day,attempts) VALUES(?,1) ON CONFLICT(day) DO UPDATE SET attempts=attempts+1 WHERE attempts<?",
    )
    .bind(now().slice(0, 10), cfg.daily_email_limit)
    .run();
  if (!quota.meta.changes) fail(429, "The daily email limit has been reached.");
  const resend = cfg.provider === "resend";
  const payload = resend
    ? {
        from: `${cfg.sender_name.replace(/[<>\r\n]/g, "")} <${from}>`,
        to: [to],
        subject,
        text,
        ...(cfg.reply_to ? { reply_to: cfg.reply_to } : {}),
      }
    : {
        personalizations: [{ to: [{ email: to }] }],
        from: { email: from, name: cfg.sender_name },
        subject,
        content: [{ type: "text/plain", value: text }],
        ...(cfg.reply_to ? { reply_to: { email: cfg.reply_to } } : {}),
      };
  const response = await fetch(
    resend
      ? "https://api.resend.com/emails"
      : "https://api.sendgrid.com/v3/mail/send",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        ...(resend ? { "Idempotency-Key": idempotency } : {}),
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15000),
    },
  );
  if (!response.ok)
    fail(502, `Email provider rejected the request (${response.status}).`);
}
async function processOutbox(env: Env) {
  const cfg = await runtime(env, 0);
  if (!cfg.updates_enabled && !cfg.reminders_enabled) return;
  const jobs = await env.DB.prepare(
    "SELECT * FROM notification_outbox WHERE status='pending' AND attempts<3 ORDER BY created_at LIMIT 20",
  ).all<{ id: string; recipient_id: string; case_id: string; kind: string }>();
  for (const job of jobs.results) {
    const claim = await env.DB.prepare(
      "UPDATE notification_outbox SET status='sending',attempts=attempts+1,updated_at=? WHERE id=? AND status='pending'",
    )
      .bind(now(), job.id)
      .run();
    if (!claim.meta.changes) continue;
    try {
      if (
        job.kind === "reminder" ? !cfg.reminders_enabled : !cfg.updates_enabled
      )
        throw new Error("Notification type disabled.");
      const recipient = await env.DB.prepare(
        `SELECT ${userColumns},email FROM officials WHERE id=? AND active=1 AND is_demo=0`,
      )
        .bind(job.recipient_id)
        .first<Official & { email: string }>();
      if (!recipient?.email) throw new Error("Recipient email unavailable.");
      const c = await readable(env.DB, recipient, job.case_id);
      if (job.kind === "reminder" && c.status === "Disposed")
        throw new Error("Case already disposed.");
      const url = new URL("/workspace", cfg.public_url);
      url.searchParams.set("case", c.id);
      await send(
        env,
        cfg,
        recipient.email,
        cfg.updates_sender,
        `${cfg.site_name}: ${job.kind === "reminder" ? "case reminder" : "case update"} ${c.id}`,
        `${c.subject}\n\n${job.kind === "reminder" ? "This case needs your attention." : "A formal case update is available."}\nDue: ${c.due_at.slice(0, 10)}\n\n${url}\n\nSign in to view the case.`,
        job.id,
      );
      await env.DB.prepare(
        "UPDATE notification_outbox SET status='accepted',last_error='',updated_at=? WHERE id=?",
      )
        .bind(now(), job.id)
        .run();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Notification failed.";
      await env.DB.prepare(
        "UPDATE notification_outbox SET status=CASE WHEN attempts>=3 THEN 'failed' ELSE 'pending' END,last_error=?,updated_at=? WHERE id=?",
      )
        .bind(message.slice(0, 200), now(), job.id)
        .run();
    }
  }
}
export default {
  fetch(request: Request, env: Env) {
    env = applicationEnv(env, request.headers.get("x-db-generation"));
    return guard(async () => {
      const user = actor(request, env);
      if (user.is_demo)
        fail(403, "Email delivery is disabled for demo accounts.");
      const input = await body(request),
        path = new URL(request.url).pathname,
        cfg = await runtime(env, 0);
      if (path === "/recovery") {
        if (!cfg.recovery_enabled) fail(503, "Recovery email is disabled.");
        const recipient = await (
          user.role === "it" ? env.CONTROL_DB || env.DB : env.DB
        )
          .prepare(
            "SELECT email FROM officials WHERE id=? AND is_demo=0 AND active=1",
          )
          .bind(user.id)
          .first<{ email: string }>();
        if (!recipient?.email) fail(400, "Account email unavailable.");
        const token = String(input.token || "");
        if (!/^(?:it\.)?[a-f0-9-]{64,100}$/i.test(token))
          fail(400, "Invalid recovery token.");
        const url = new URL("/reset", cfg.public_url);
        url.searchParams.set("token", token);
        await send(
          env,
          cfg,
          recipient.email,
          cfg.recovery_sender,
          `${cfg.site_name}: password reset`,
          `Reset your password using this link. It expires in 30 minutes.\n\n${url}\n\nIf you did not request this, ignore this email.`,
          String(input.request_id),
        );
        return json({ ok: true });
      }
      if (path === "/verification") {
        if (user.role !== "it") fail(403, "IT access required.");
        const recipient = await (
          user.role === "it" ? env.CONTROL_DB || env.DB : env.DB
        )
          .prepare(
            "SELECT email FROM officials WHERE id=? AND is_demo=0 AND active=1",
          )
          .bind(user.id)
          .first<{ email: string }>();
        if (!recipient?.email) fail(400, "Add your account email first.");
        const sender =
          input.sender === "recovery"
            ? cfg.recovery_sender
            : cfg.updates_sender;
        await send(
          env,
          cfg,
          recipient.email,
          sender,
          `${cfg.site_name}: sender verification`,
          "This message confirms the configured email provider accepted a message from this sender.",
          crypto.randomUUID(),
        );
        return json({ ok: true });
      }
      if (path === "/dispatch") {
        await processOutbox(env);
        return json({ ok: true });
      }
      return fail(404, "Unknown notification action.");
    });
  },
  async scheduled(
    _controller: ScheduledController,
    env: Env,
    ctx: ExecutionContext,
  ) {
    env = applicationEnv(env);
    ctx.waitUntil(
      (async () => {
        const cfg = await runtime(env, 0);
        if (cfg.reminders_enabled) {
          const date = now(),
            until = new Date(
              Date.now() + cfg.reminder_days * 86400000,
            ).toISOString();
          await env.DB.prepare(
            "INSERT OR IGNORE INTO notification_outbox(id,recipient_id,case_id,kind,created_at,updated_at) SELECT 'reminder-'||c.id||'-'||?,c.assigned_to,c.id,'reminder',?,? FROM cases c JOIN officials o ON o.id=c.assigned_to WHERE c.is_demo=0 AND c.intake='Approved' AND c.status<>'Disposed' AND c.due_at<=? AND o.active=1 AND o.email<>'' AND NOT EXISTS(SELECT 1 FROM notification_outbox n WHERE n.id='reminder-'||c.id||'-'||?) ORDER BY c.due_at LIMIT 20",
          )
            .bind(date.slice(0, 10), date, date, until, date.slice(0, 10))
            .run();
        }
        await env.DB.prepare(
          "UPDATE notification_outbox SET status='pending' WHERE status='sending' AND updated_at<?",
        )
          .bind(new Date(Date.now() - 300000).toISOString())
          .run();
        await processOutbox(env);
      })(),
    );
  },
} satisfies ExportedHandler<Env>;
