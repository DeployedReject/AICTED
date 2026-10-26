import { caseNotice } from "../casework/notices";
import { institutionAdmin } from "./admin";
import type { Env } from "../shared";
import { actor, body, fail, guard, id, json, now, textField } from "../shared";
import { applicationEnv } from "../database/client";
import { passwordHash, sha } from "../auth";
import { runtime } from "../runtime";
import { driveFolder } from "../../packages/shared/drive";

export default {
  fetch(request: Request, original: Env) {
    const env = applicationEnv(
      original,
      request.headers.get("x-db-generation"),
    );
    return guard(async () => {
      const url = new URL(request.url),
        db = env.DB;
      if (request.headers.get("x-internal-secret") !== env.INTERNAL_SECRET)
        fail(403, "Private service.");
      if (
        url.pathname === "/api/institution/login" &&
        request.method === "POST"
      ) {
        const input = await body(request),
          accountId = textField(input.id, "Account ID", 80),
          password = textField(input.password, "Password", 256);
        const account = await db
          .prepare(
            "SELECT a.*,i.name institution_name FROM institution_accounts a JOIN institutions i ON i.id=a.institution_id WHERE a.id=? AND a.active=1 AND i.active=1 AND a.is_demo=i.is_demo",
          )
          .bind(accountId)
          .first<{
            id: string;
            institution_id: string;
            name: string;
            email: string;
            password_hash: string;
            password_salt: string;
            is_demo: number;
            institution_name: string;
          }>();
        const hash = await passwordHash(
          password,
          account?.password_salt || "00000000000000000000000000000000",
        );
        if (!account || hash !== account.password_hash)
          fail(401, "The institution ID or password is incorrect.");
        const token =
            "institution." + crypto.randomUUID() + crypto.randomUUID(),
          cfg = await runtime(env, account.is_demo),
          seconds = cfg.session_hours * 3600;
        await db.batch([
          db
            .prepare(
              "DELETE FROM institution_sessions WHERE account_id=? AND expires_at<?",
            )
            .bind(account.id, Math.floor(Date.now() / 1000)),
          db
            .prepare(
              "INSERT INTO institution_sessions(token_hash,account_id,expires_at) VALUES(?,?,?)",
            )
            .bind(
              await sha(token),
              account.id,
              Math.floor(Date.now() / 1000) + seconds,
            ),
        ]);
        return new Response(
          JSON.stringify({
            user: {
              id: account.id,
              name: account.name,
              role: "institution",
              institution_id: account.institution_id,
            },
          }),
          {
            headers: {
              "Content-Type": "application/json",
              "Cache-Control": "no-store",
              "Set-Cookie": `aicted_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${seconds}${request.headers.get("x-forwarded-proto") === "https" ? "; Secure" : ""}`,
            },
          },
        );
      }
      const user = actor(request, env);
      if (url.pathname.startsWith("/api/admin/"))
        return institutionAdmin(request, env, user);
      if (user.role !== "institution" || !user.institution_id)
        fail(403, "Institution access is required.");
      const institution = await db
        .prepare(
          "SELECT id,name,permanent_id,address,city,district,state,postal_code,region FROM institutions WHERE id=? AND is_demo=? AND active=1",
        )
        .bind(user.institution_id, user.is_demo)
        .first();
      if (!institution) fail(403, "Institution access is unavailable.");
      if (
        url.pathname === "/api/institution/bootstrap" &&
        request.method === "GET"
      ) {
        const [tags, routes] = await Promise.all([
          db
            .prepare(
              "SELECT code,label,group_name FROM tags WHERE is_demo=? AND active=1 ORDER BY group_name,label LIMIT 100",
            )
            .bind(user.is_demo)
            .all(),
          db
            .prepare(
              "SELECT r.bureau,u.name FROM institution_routing r JOIN org_units u ON u.code=r.bureau JOIN officials o ON o.id=r.approver_id WHERE r.is_demo=? AND o.active=1 AND o.role='manager' AND o.is_demo=r.is_demo AND o.bureau=r.bureau AND u.active=1 ORDER BY u.name",
            )
            .bind(user.is_demo)
            .all(),
        ]);
        return json({
          user,
          institution,
          tags: tags.results,
          routes: routes.results,
        });
      }
      if (url.pathname === "/api/institution/cases") {
        if (request.method === "GET") {
          const cursor = (url.searchParams.get("cursor") || "").slice(0, 100),
            result = await db
              .prepare(
                "SELECT c.id,c.subject,c.intake,c.status,c.escalated,c.bureau,u.name bureau_name,c.received_at,c.due_at,c.updated_at,c.cancellation_state,c.institution_escalation FROM cases c LEFT JOIN org_units u ON u.code=c.bureau WHERE c.institution_id=? AND c.is_demo=? AND c.institution_account_id IS NOT NULL AND c.id<? ORDER BY c.id DESC LIMIT 21",
              )
              .bind(user.institution_id, user.is_demo, cursor || "~")
              .all();
          return json({
            cases: result.results.slice(0, 20),
            next: result.results.length > 20 ? result.results[19].id : null,
          });
        }
        if (request.method !== "POST") fail(405, "Method not allowed.");
        const input = await body(request),
          subject = textField(input.subject, "Subject", 160, 5),
          description = textField(input.description, "Description", 5000, 20),
          bureau = textField(input.bureau, "Bureau", 80);
        const route = await db
          .prepare(
            "SELECT o.id FROM institution_routing r JOIN officials o ON o.id=r.approver_id JOIN org_units u ON u.code=r.bureau WHERE r.is_demo=? AND r.bureau=? AND o.active=1 AND o.is_demo=r.is_demo AND o.bureau=r.bureau AND o.role='manager' AND u.active=1",
          )
          .bind(user.is_demo, bureau)
          .first<{ id: string }>();
        if (!route)
          fail(
            400,
            "Choose an available receiving bureau. Administration must configure its intake manager first.",
          );
        if (
          user.is_demo &&
          Number(
            (
              await db
                .prepare(
                  "SELECT COUNT(*) n FROM cases WHERE institution_account_id=?",
                )
                .bind(user.id)
                .first<{ n: number }>()
            )?.n,
          ) >= 20
        )
          fail(429, "The test account case limit has been reached.");
        const tags = Array.isArray(input.tags)
          ? [
              ...new Set(
                input.tags.filter((x): x is string => typeof x === "string"),
              ),
            ].slice(0, 8)
          : [];
        if (tags.length) {
          const known = await db
            .prepare(
              "SELECT code FROM tags WHERE is_demo=? AND active=1 AND code IN(" +
                tags.map(() => "?").join(",") +
                ")",
            )
            .bind(user.is_demo, ...tags)
            .all();
          if (known.results.length !== tags.length)
            fail(400, "Choose available case tags.");
        }
        let folder = "";
        try {
          folder = driveFolder(
            typeof input.folder_url === "string" ? input.folder_url : "",
          );
        } catch (error) {
          fail(400, (error as Error).message);
        }
        const caseId = (user.is_demo ? "DEMO-" : "CASE-") + crypto.randomUUID(),
          stamp = now();
        const statements = [
          db
            .prepare(
              "INSERT INTO cases(id,subject,institution_id,bureau,assigned_to,created_by,status,intake,priority,tags,description,next_action,received_at,due_at,updated_at,is_demo,institution_account_id) VALUES(?,?,?,?,?,?,'Pending','Submitted','Routine',?,?,'Review institution submission.',?,'',?,?,?)",
            )
            .bind(
              caseId,
              subject,
              user.institution_id,
              bureau,
              route.id,
              route.id,
              JSON.stringify(tags),
              description,
              stamp,
              stamp,
              user.is_demo,
              user.id,
            ),
          db
            .prepare(
              "INSERT INTO institution_events(id,case_id,account_id,kind,body,created_at,actor_name) VALUES(?,?,?,'submitted',?,?,?)",
            )
            .bind(
              id("institution-event"),
              caseId,
              user.id,
              "Submitted by the institution.",
              stamp,
              user.name,
            ),
        ];
        if (folder)
          statements.push(
            db
              .prepare(
                "INSERT INTO case_folders(case_id,drive_url,updated_by,updated_at,is_public) VALUES(?,?,?,?,1)",
              )
              .bind(caseId, folder, route.id, stamp),
          );
        await db.batch(statements);
        await caseNotice(
          env,
          caseId,
          "intake",
          "An institution submitted a case for intake review.",
          caseId,
        );
        return json({ id: caseId }, 201);
      }
      const match = url.pathname.match(
        /^\/api\/institution\/cases\/([^/]+)(?:\/(history|escalation|cancellation|review|resubmit))?$/,
      );
      if (!match) fail(404, "Institution route not found.");
      const caseId = decodeURIComponent(match[1]),
        operation = match[2];
      const c = await db
        .prepare(
          "SELECT c.id,c.subject,c.description,c.bureau,u.name bureau_name,c.intake,c.status,c.escalated,c.received_at,c.due_at,c.updated_at,c.cancellation_state,c.institution_escalation FROM cases c LEFT JOIN org_units u ON u.code=c.bureau WHERE c.id=? AND c.institution_id=? AND c.is_demo=? AND c.institution_account_id IS NOT NULL",
        )
        .bind(caseId, user.institution_id, user.is_demo)
        .first<{
          id: string;
          status: string;
          intake: string;
          cancellation_state: string;
          institution_escalation: string;
        }>();
      if (!c) fail(404, "Case not found.");
      if (request.method === "GET" && !operation) {
        const folder = await db
          .prepare(
            "SELECT drive_url FROM case_folders WHERE case_id=? AND is_public=1",
          )
          .bind(caseId)
          .first();
        return json({ case: c, folder });
      }
      if (request.method === "GET" && operation === "history") {
        const cursor = (url.searchParams.get("cursor") || "").slice(0, 100);
        let date = "~",
          key = "~";
        if (cursor) {
          try {
            const parsed = JSON.parse(atob(cursor));
            date = String(parsed[0]);
            key = String(parsed[1]);
          } catch {
            fail(400, "Invalid history cursor.");
          }
        }
        const result = await db
          .prepare(
            "WITH public_history AS (SELECT e.id,e.kind,CASE WHEN e.is_public=1 THEN e.body ELSE CASE e.kind WHEN 'approved' THEN 'Submission approved for processing.' WHEN 'returned' THEN 'Changes requested by the reviewing bureau.' WHEN 'rejected' THEN 'Submission was not accepted.' WHEN 'disposed' THEN 'Case disposed.' WHEN 'reopened' THEN 'Case reopened.' WHEN 'escalated' THEN 'Case escalated.' WHEN 'transferred' THEN 'Case transferred to '||e.case_bureau_snapshot||'.' WHEN 'cancellation_approved' THEN 'Cancellation approved.' WHEN 'cancellation_rejected' THEN 'Cancellation request declined.' WHEN 'escalation_approved' THEN 'Escalation request approved.' WHEN 'escalation_rejected' THEN 'Escalation request declined.' ELSE 'Case status: '||e.case_status_snapshot END END body,e.created_at,CASE WHEN e.is_public=1 THEN e.actor_name_snapshot ELSE 'AICTE' END actor_name,NULL rating FROM case_events e WHERE e.case_id=? AND (e.is_public=1 OR e.kind IN('approved','returned','rejected','status','disposed','reopened','escalated','transferred','cancellation_approved','cancellation_rejected','escalation_approved','escalation_rejected')) UNION ALL SELECT id,kind,body,created_at,actor_name,rating FROM institution_events WHERE case_id=?) SELECT * FROM public_history WHERE created_at<? OR (created_at=? AND id<?) ORDER BY created_at DESC,id DESC LIMIT 31",
          )
          .bind(caseId, caseId, date, date, key)
          .all();
        return json({
          events: result.results.slice(0, 30),
          next:
            result.results.length > 30
              ? btoa(
                  JSON.stringify([
                    result.results[29].created_at,
                    result.results[29].id,
                  ]),
                )
              : null,
        });
      }
      if (request.method !== "POST") fail(405, "Method not allowed.");
      const input = await body(request),
        stamp = now();
      if (operation === "review") {
        if (c.status !== "Disposed")
          fail(409, "Reviews are available after a case is closed.");
        const rating = Number(input.rating),
          message = textField(input.body, "Review", 2000, 3);
        if (!Number.isInteger(rating) || rating < 1 || rating > 5)
          fail(400, "Choose a rating from 1 to 5.");
        const result = await db
          .prepare(
            "INSERT INTO institution_events(id,case_id,account_id,kind,body,created_at,actor_name,rating) VALUES(?,?,?,'review',?,?,?,?) ON CONFLICT DO NOTHING",
          )
          .bind(
            id("institution-event"),
            caseId,
            user.id,
            message,
            stamp,
            user.name,
            rating,
          )
          .run();
        if (!result.meta.changes)
          fail(409, "This account has already reviewed this case.");
        return json({ ok: true });
      }
      if (operation === "resubmit") {
        if (c.intake !== "Returned")
          fail(409, "Only returned submissions can be revised.");
        const description = textField(
          input.description,
          "Description",
          5000,
          20,
        );
        await db.batch([
          db
            .prepare(
              "UPDATE cases SET description=?,intake='Submitted',updated_at=? WHERE id=? AND intake='Returned'",
            )
            .bind(description, stamp, caseId),
          db
            .prepare(
              "INSERT INTO institution_events(id,case_id,account_id,kind,body,created_at,actor_name) VALUES(?,?,?,'resubmitted','Revised submission sent for review.',?,?)",
            )
            .bind(id("institution-event"), caseId, user.id, stamp, user.name),
        ]);
        return json({ ok: true });
      }
      if (operation !== "escalation" && operation !== "cancellation")
        fail(404, "Unknown case action.");
      if (c.status === "Disposed" || c.intake === "Rejected")
        fail(409, "This case is already closed.");
      const reason = textField(input.reason, "Reason", 2000, 5),
        column =
          operation === "escalation"
            ? "institution_escalation"
            : "cancellation_state";
      const result = await db.batch([
        db
          .prepare(
            `INSERT INTO institution_events(id,case_id,account_id,kind,body,created_at,actor_name) SELECT ?,id,?,?,?,?,? FROM cases WHERE id=? AND ${column}<>'Awaiting review'`,
          )
          .bind(
            id("institution-event"),
            user.id,
            operation + "_requested",
            reason,
            stamp,
            user.name,
            caseId,
          ),
        db
          .prepare(
            `UPDATE cases SET ${column}='Awaiting review',updated_at=? WHERE id=? AND ${column}<>'Awaiting review'`,
          )
          .bind(stamp, caseId),
      ]);
      if (!result[1].meta.changes)
        fail(409, "Your request is already awaiting review.");
      await caseNotice(
        env,
        caseId,
        operation,
        "The institution requested " +
          operation +
          ". A responsible manager must review the request.",
      );
      return json({ ok: true });
    });
  },
} satisfies ExportedHandler<Env>;
