import type { Official } from "../../packages/shared/types";
import type { Env } from "../shared";
import {
  actor,
  body,
  fail,
  guard,
  id,
  json,
  now,
  textField,
  userColumns,
} from "../shared";
import {
  caseRow,
  caseSelect,
  managerFor,
  mayAct,
  readable,
  scope,
  teamMember,
} from "./access";

import { admin } from "./admin";
const limit = 25;
function event(
  db: D1Database,
  caseId: string,
  kind: string,
  user: Official,
  message: string,
  stamp = now(),
) {
  return db
    .prepare(
      "INSERT INTO case_events(id,case_id,kind,actor_id,body,created_at) VALUES(?,?,?,?,?,?)",
    )
    .bind(id("event"), caseId, kind, user.id, message, stamp);
}
async function summary(env: Env, user: Official) {
  const s = scope(user);
  return env.DB.prepare(
    `${s.sql} SELECT COUNT(*) AS total,COALESCE(SUM(intake='Approved' AND status='Pending'),0) AS pending,COALESCE(SUM(intake='Approved' AND status IN('Under process','Awaiting information')),0) AS processing,COALESCE(SUM(intake='Approved' AND status='Disposed'),0) AS disposed,COALESCE(SUM(intake='Approved' AND status<>'Disposed' AND due_at<?),0) AS overdue,COALESCE(SUM(intake='Approved' AND escalated=1 AND status<>'Disposed'),0) AS escalated,COALESCE(SUM(intake='Submitted'),0) AS proposed FROM cases WHERE id IN(SELECT id FROM visible)`,
  )
    .bind(...s.args, now())
    .first();
}
export default {
  fetch(request: Request, env: Env) {
    return guard(async () => {
      const user = actor(request, env),
        db = env.DB,
        url = new URL(request.url),
        path = url.pathname;
      const s = scope(user);
      if (path === "/api/admin" || path === "/api/admin/officials")
        return admin(request, env, user);
      if (request.method === "GET" && path === "/api/bootstrap") {
        const [officials, tags, counts] = await Promise.all([
          db
            .prepare(
              `SELECT ${userColumns} FROM officials WHERE is_demo=? AND active=1 ORDER BY bureau,name LIMIT 100`,
            )
            .bind(user.is_demo)
            .all(),
          db
            .prepare(
              "SELECT code,label,group_name FROM tags ORDER BY group_name,label LIMIT 100",
            )
            .all(),
          summary(env, user),
        ]);
        return json({
          user,
          officials: officials.results,
          tags: tags.results,
          summary: counts,
        });
      }
      if (request.method === "GET" && path === "/api/cases") {
        const params = url.searchParams,
          conditions = ["c.id IN(SELECT id FROM visible)"],
          args: unknown[] = [];
        const view = params.get("view") || "assigned";
        if (view === "assigned") {
          conditions.push(
            "c.assigned_to=? AND c.intake='Approved' AND c.status<>'Disposed'",
          );
          args.push(user.id);
        }
        if (view === "team") {
          if (user.role !== "manager") fail(403, "Manager access is required.");
          conditions.push("c.intake='Approved'");
        }
        if (view === "proposed")
          conditions.push("c.intake IN('Submitted','Returned','Rejected')");
        if (view === "all") conditions.push("c.intake='Approved'");
        if (params.get("institution")) {
          conditions.push("c.institution_id=?");
          args.push(params.get("institution"));
        }
        if (params.get("tag")) {
          conditions.push(
            "EXISTS(SELECT 1 FROM json_each(c.tags) WHERE value=?)",
          );
          args.push(params.get("tag"));
        }
        if (params.get("status")) {
          conditions.push("c.status=?");
          args.push(params.get("status"));
        }
        if (params.get("bureau")) {
          conditions.push("c.bureau=?");
          args.push(params.get("bureau"));
        }
        if (params.get("region")) {
          conditions.push("i.region=?");
          args.push(params.get("region"));
        }
        if (params.get("from")) {
          conditions.push("c.received_at>=?");
          args.push(params.get("from"));
        }
        if (params.get("to")) {
          conditions.push("c.received_at<=?");
          args.push(params.get("to") + "T23:59:59.999Z");
        }
        if (params.get("q")) {
          conditions.push("(c.id LIKE ? OR c.subject LIKE ?)");
          args.push(
            "%" + params.get("q")?.slice(0, 100) + "%",
            "%" + params.get("q")?.slice(0, 100) + "%",
          );
        }
        if (params.get("attention") === "overdue") {
          conditions.push("c.status<>'Disposed' AND c.due_at<?");
          args.push(now());
        }
        if (params.get("attention") === "escalated")
          conditions.push("c.escalated=1 AND c.status<>'Disposed'");
        if (params.get("cursor")) {
          conditions.push("c.id<?");
          args.push(params.get("cursor"));
        }
        const result = await db
          .prepare(
            `${s.sql} ${caseSelect} WHERE ${conditions.join(" AND ")} ORDER BY c.id DESC LIMIT ?`,
          )
          .bind(...s.args, ...args, limit + 1)
          .all<Record<string, unknown>>();
        const rows = result.results.slice(0, limit).map(caseRow);
        return json({
          cases: rows,
          next: result.results.length > limit ? rows[rows.length - 1].id : null,
        });
      }
      if (request.method === "GET" && path === "/api/institutions") {
        const q = (url.searchParams.get("q") || "").slice(0, 100);
        const result = await db
          .prepare(
            `SELECT i.*,COALESCE(SUM(c.intake='Approved' AND c.status<>'Disposed'),0) active_cases,COALESCE(SUM(c.intake='Approved' AND c.status='Disposed'),0) past_cases FROM institutions i LEFT JOIN cases c ON c.institution_id=i.id AND c.id IN(SELECT id FROM visible) WHERE i.is_demo=? AND (i.name LIKE ? OR i.permanent_id LIKE ?) GROUP BY i.id ORDER BY i.name LIMIT 30`.replace(
              "SELECT i.*",
              `${s.sql} SELECT i.*`,
            ),
          )
          .bind(...s.args, user.is_demo, "%" + q + "%", "%" + q + "%")
          .all();
        return json({ institutions: result.results });
      }
      if (request.method === "GET" && path === "/api/team") {
        if (user.role !== "manager") fail(403, "Manager access is required.");
        const result = await db
          .prepare(
            `${s.sql} SELECT o.id,o.name,o.designation,o.bureau,o.manager_id,o.is_demo,COUNT(c.id) AS active_cases FROM officials o LEFT JOIN cases c ON c.assigned_to=o.id AND c.intake='Approved' AND c.status<>'Disposed' AND c.is_demo=? WHERE o.id IN(SELECT id FROM team) AND o.id<>? GROUP BY o.id ORDER BY o.name LIMIT 100`,
          )
          .bind(...s.args, user.is_demo, user.id)
          .all();
        return json({ officials: result.results });
      }
      if (request.method === "GET" && path === "/api/reports") {
        const rows = await db
          .prepare(
            `${s.sql} SELECT c.bureau,i.region,c.status,c.intake,c.escalated,c.received_at,c.due_at,c.updated_at FROM cases c JOIN institutions i ON i.id=c.institution_id WHERE c.id IN(SELECT id FROM visible) ORDER BY c.received_at DESC LIMIT 500`,
          )
          .bind(...s.args)
          .all();
        return json({
          rows: rows.results,
          as_of: now(),
          limited: rows.results.length === 500,
        });
      }
      if (request.method === "GET" && path === "/api/messages") {
        const result = await db
          .prepare(
            `${s.sql} SELECT m.id,m.sender_id,m.recipient_id,CASE WHEN m.case_id IS NULL OR m.case_id IN(SELECT id FROM visible) THEN m.body ELSE 'Case access has been revoked.' END body,CASE WHEN m.case_id IN(SELECT id FROM visible) THEN m.case_id ELSE NULL END case_id,m.created_at,m.read_at,a.name sender_name,b.name recipient_name FROM messages m JOIN officials a ON a.id=m.sender_id JOIN officials b ON b.id=m.recipient_id WHERE m.is_demo=? AND (m.sender_id=? OR m.recipient_id=?) ORDER BY m.created_at DESC LIMIT 50`,
          )
          .bind(...s.args, user.is_demo, user.id, user.id)
          .all();
        return json({ messages: result.results });
      }
      if (request.method === "POST" && path === "/api/messages") {
        const input = await body(request),
          recipientId = textField(input.recipient_id, "Recipient", 80),
          message = textField(input.body, "Message", 3000);
        const recipient = await db
          .prepare(
            "SELECT id FROM officials WHERE id=? AND is_demo=? AND active=1",
          )
          .bind(recipientId, user.is_demo)
          .first();
        if (!recipient || recipientId === user.id)
          fail(400, "Choose another official in this workspace.");
        const caseId = input.case_id
          ? textField(input.case_id, "Case ID", 100)
          : null;
        if (caseId) {
          await readable(db, user, caseId);
          const receiver = await db
            .prepare(`SELECT ${userColumns} FROM officials WHERE id=?`)
            .bind(recipientId)
            .first<Official>();
          if (!receiver) fail(400, "Recipient not found.");
          try {
            await readable(db, receiver, caseId);
          } catch {
            fail(
              403,
              "This recipient does not have case access. Request coordination first.",
            );
          }
        }
        if (
          user.is_demo &&
          Number(
            (
              await db
                .prepare("SELECT COUNT(*) n FROM messages WHERE is_demo=1")
                .first<{ n: number }>()
            )?.n,
          ) > 500
        )
          fail(429, "The test workspace message limit has been reached.");
        await db
          .prepare(
            "INSERT INTO messages(id,sender_id,recipient_id,case_id,body,created_at,is_demo) VALUES(?,?,?,?,?,?,?)",
          )
          .bind(
            id("message"),
            user.id,
            recipientId,
            caseId,
            message,
            now(),
            user.is_demo,
          )
          .run();
        return json({ ok: true }, 201);
      }
      if (request.method === "POST" && path === "/api/cases") {
        const input = await body(request);
        const subject = textField(input.subject, "Subject", 160, 5),
          description = textField(input.description, "Description", 5000, 20),
          institutionId = textField(input.institution_id, "Institution", 100),
          nextAction = textField(input.next_action, "Next action", 300, 3);
        if (
          !(await db
            .prepare("SELECT id FROM institutions WHERE id=? AND is_demo=?")
            .bind(institutionId, user.is_demo)
            .first())
        )
          fail(400, "Choose an institution from this workspace.");
        const tagCodes = Array.isArray(input.tags)
          ? input.tags
              .filter((t): t is string => typeof t === "string")
              .slice(0, 8)
          : [];
        const known = (
          await db
            .prepare("SELECT code FROM tags LIMIT 100")
            .all<{ code: string }>()
        ).results.map((t) => t.code);
        if (tagCodes.some((t) => !known.includes(t)))
          fail(400, "Choose tags from the catalogue.");
        if (
          user.is_demo &&
          Number(
            (
              await db
                .prepare("SELECT COUNT(*) n FROM cases WHERE is_demo=1")
                .first<{ n: number }>()
            )?.n,
          ) >= 100
        )
          fail(429, "The test workspace case limit has been reached.");
        const date = String(input.received_at || "");
        if (
          !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
          !Number.isFinite(Date.parse(date)) ||
          date > now().slice(0, 10)
        )
          fail(400, "Choose a valid received date.");
        const due = String(input.due_at || "");
        if (
          !/^\d{4}-\d{2}-\d{2}$/.test(due) ||
          !Number.isFinite(Date.parse(due)) ||
          due < date
        )
          fail(400, "Choose a due date on or after receipt.");
        const caseId = `${user.is_demo ? "DEMO" : "CASE"}-${Date.now()}-${crypto.randomUUID().slice(0, 4).toUpperCase()}`;
        const stamp = now();
        await db.batch([
          db
            .prepare(
              `INSERT INTO cases(id,subject,institution_id,bureau,assigned_to,created_by,status,intake,priority,tags,description,next_action,received_at,due_at,updated_at,is_demo) VALUES(?,?,?,?,?,?,'Pending','Submitted',?,?,?,?,?,?,?,?)`,
            )
            .bind(
              caseId,
              subject,
              institutionId,
              user.bureau,
              user.id,
              user.id,
              ["Routine", "High", "Urgent"].includes(String(input.priority))
                ? input.priority
                : "Routine",
              JSON.stringify(tagCodes),
              description,
              nextAction,
              date + "T00:00:00.000Z",
              due + "T23:59:59.999Z",
              stamp,
              user.is_demo,
            ),
          event(
            db,
            caseId,
            "submitted",
            user,
            "Proposed case submitted for manager review.",
            stamp,
          ),
        ]);
        return json({ id: caseId }, 201);
      }
      const match = path.match(
        /^\/api\/cases\/([^/]+)(?:\/(comments|action|decision|coordination|resubmit))?$/,
      );
      if (match) {
        const caseId = decodeURIComponent(match[1]),
          c = await readable(db, user, caseId),
          action = match[2];
        const canAct = await mayAct(db, user, c);
        if (request.method === "GET" && !action) {
          const [events, coordination, candidates] = await Promise.all([
            db
              .prepare(
                `SELECT e.*,o.name actor_name,o.designation,o.bureau FROM case_events e JOIN officials o ON o.id=e.actor_id WHERE e.case_id=? ORDER BY e.created_at DESC,e.id DESC LIMIT 60`,
              )
              .bind(caseId)
              .all(),
            db
              .prepare(
                `SELECT r.*,o.name target_name FROM coordination_requests r JOIN officials o ON o.id=r.target_official_id WHERE r.case_id=? ORDER BY r.created_at DESC LIMIT 20`,
              )
              .bind(caseId)
              .all(),
            db
              .prepare(
                `SELECT DISTINCT other.bureau FROM cases other WHERE other.is_demo=? AND other.institution_id=? AND other.bureau<>? AND other.intake='Approved' AND EXISTS(SELECT 1 FROM json_each(other.tags) tag JOIN json_each(?) own ON own.value=tag.value) LIMIT 6`,
              )
              .bind(
                user.is_demo,
                c.institution_id,
                c.bureau,
                JSON.stringify(c.tags),
              )
              .all(),
          ]);
          const records = await Promise.all(
            coordination.results.map(async (r) => ({
              ...r,
              can_approve:
                r.status === "Awaiting manager"
                  ? await managerFor(db, user, String(r.requester_id), c.bureau)
                  : r.status === "Awaiting Bureau"
                    ? await managerFor(
                        db,
                        user,
                        String(r.target_official_id),
                        String(r.target_bureau),
                      )
                    : false,
            })),
          );
          return json({
            case: {
              ...c,
              can_act: canAct,
              can_comment: c.intake === "Approved",
            },
            events: events.results,
            coordination: records,
            candidates: candidates.results,
          });
        }
        if (request.method === "POST") {
          const input = await body(request),
            stamp = now();
          if (
            user.is_demo &&
            Number(
              (
                await db
                  .prepare("SELECT COUNT(*) n FROM case_events WHERE case_id=?")
                  .bind(caseId)
                  .first<{ n: number }>()
              )?.n,
            ) >= 100
          )
            fail(429, "This demo case has reached its update limit.");
          if (action === "resubmit") {
            if (c.created_by !== user.id || c.intake !== "Returned")
              fail(
                403,
                "Only the submitting official can resubmit a returned proposal.",
              );
            const description = textField(
                input.description,
                "Description",
                5000,
                20,
              ),
              nextAction = textField(input.next_action, "Next action", 300, 3);
            await db.batch([
              db
                .prepare(
                  "INSERT INTO case_events(id,case_id,kind,actor_id,body,created_at) SELECT ?,id,'resubmitted',?,?,? FROM cases WHERE id=? AND intake='Returned'",
                )
                .bind(
                  id("event"),
                  user.id,
                  "Returned proposal updated and resubmitted.",
                  stamp,
                  caseId,
                ),
              db
                .prepare(
                  "UPDATE cases SET description=?,next_action=?,intake='Submitted',updated_at=? WHERE id=? AND intake='Returned'",
                )
                .bind(description, nextAction, stamp, caseId),
            ]);
          } else if (action === "comments") {
            if (c.intake !== "Approved")
              fail(
                403,
                "Comments are available after the proposal is approved.",
              );
            const message = textField(input.body, "Comment", 3000);
            await db.batch([
              event(db, caseId, "comment", user, message, stamp),
              db
                .prepare("UPDATE cases SET updated_at=? WHERE id=?")
                .bind(stamp, caseId),
            ]);
          } else if (action === "decision") {
            if (c.intake !== "Submitted")
              fail(409, "This proposal has already been reviewed.");
            if (!(await managerFor(db, user, c.created_by, c.bureau)))
              fail(
                403,
                "A designated manager must review this proposal. You cannot approve your own case.",
              );
            const decision = String(input.decision);
            if (!["Approved", "Returned", "Rejected"].includes(decision))
              fail(400, "Choose a valid decision.");
            const reason = textField(input.reason, "Decision note", 1000, 3);
            const results = await db.batch([
              db
                .prepare(
                  "INSERT INTO case_events(id,case_id,kind,actor_id,body,created_at) SELECT ?,id,?,?,?,? FROM cases WHERE id=? AND intake='Submitted'",
                )
                .bind(
                  id("event"),
                  decision.toLowerCase(),
                  user.id,
                  reason,
                  stamp,
                  caseId,
                ),
              db
                .prepare(
                  "UPDATE cases SET intake=?,approval_reason=?,updated_at=? WHERE id=? AND intake='Submitted'",
                )
                .bind(decision, reason, stamp, caseId),
            ]);
            if (!results[1].meta.changes)
              fail(409, "This proposal has already been reviewed.");
          } else if (action === "action") {
            if (!canAct || c.intake !== "Approved")
              fail(
                403,
                "Only the assigned official or their designated manager can change this case.",
              );
            const reason = textField(input.reason, "Update note", 1000, 3),
              type = String(input.action);
            let statement: D1PreparedStatement;
            if (type === "escalate") {
              if (c.escalated || c.status === "Disposed")
                fail(409, "This case cannot be escalated.");
              statement = db
                .prepare("UPDATE cases SET escalated=1,updated_at=? WHERE id=?")
                .bind(stamp, caseId);
            } else if (type === "dispose") {
              if (c.status === "Disposed")
                fail(409, "This case is already disposed.");
              statement = db
                .prepare(
                  "UPDATE cases SET status='Disposed',updated_at=? WHERE id=?",
                )
                .bind(stamp, caseId);
            } else if (type === "reopen") {
              if (c.status !== "Disposed")
                fail(409, "Only disposed cases can be reopened.");
              statement = db
                .prepare(
                  "UPDATE cases SET status='Under process',escalated=0,updated_at=? WHERE id=?",
                )
                .bind(stamp, caseId);
            } else if (type === "status") {
              const status = String(input.status);
              if (
                !["Pending", "Under process", "Awaiting information"].includes(
                  status,
                ) ||
                c.status === "Disposed"
              )
                fail(400, "Choose a valid active status.");
              statement = db
                .prepare(
                  "UPDATE cases SET status=?,next_action=?,updated_at=? WHERE id=?",
                )
                .bind(
                  status,
                  textField(input.next_action, "Next action", 300),
                  stamp,
                  caseId,
                );
            } else if (type === "transfer") {
              const target = await db
                .prepare(
                  `SELECT ${userColumns} FROM officials WHERE id=? AND is_demo=? AND active=1`,
                )
                .bind(input.official_id, user.is_demo)
                .first<Official>();
              if (
                !target ||
                target.id === c.assigned_to ||
                c.status === "Disposed"
              )
                fail(400, "Choose another assigned official.");
              if (
                user.role !== "manager" ||
                target.bureau !== c.bureau ||
                !(await teamMember(db, user, target.id))
              )
                fail(
                  403,
                  "Transfers must be within your managed team. Cross-Bureau work needs coordination.",
                );
              statement = db
                .prepare(
                  "UPDATE cases SET assigned_to=?,updated_at=? WHERE id=?",
                )
                .bind(target.id, stamp, caseId);
            } else return fail(400, "Unknown case action.");
            await db.batch([
              statement,
              event(
                db,
                caseId,
                type === "status"
                  ? "status"
                  : type === "escalate"
                    ? "escalated"
                    : type === "dispose"
                      ? "disposed"
                      : type === "reopen"
                        ? "reopened"
                        : "transferred",
                user,
                reason,
                stamp,
              ),
            ]);
          } else if (action === "coordination") {
            if (c.intake !== "Approved" || !canAct)
              fail(
                403,
                "Only the case owner or manager can request coordination.",
              );
            const target = await db
              .prepare(
                `SELECT ${userColumns} FROM officials WHERE id=? AND is_demo=? AND active=1`,
              )
              .bind(input.target_official_id, user.is_demo)
              .first<Official>();
            if (!target || target.bureau === c.bureau)
              fail(400, "Select an official from another Bureau.");
            const reason = textField(
              input.reason,
              "Coordination reason",
              1000,
              5,
            );
            if (
              await db
                .prepare(
                  "SELECT id FROM coordination_requests WHERE case_id=? AND target_official_id=? AND status IN('Awaiting manager','Awaiting Bureau','Approved')",
                )
                .bind(caseId, target.id)
                .first()
            )
              fail(
                409,
                "A coordination request already exists for this official.",
              );
            await db.batch([
              db
                .prepare(
                  "INSERT INTO coordination_requests(id,case_id,requester_id,target_official_id,target_bureau,status,reason,created_at) VALUES(?,?,?,?,?,'Awaiting manager',?,?)",
                )
                .bind(
                  id("coord"),
                  caseId,
                  user.id,
                  target.id,
                  target.bureau,
                  reason,
                  stamp,
                ),
              event(
                db,
                caseId,
                "coordination",
                user,
                `Coordination requested with ${target.bureau} for ${target.name}. ${reason}`,
                stamp,
              ),
            ]);
          } else return fail(404, "Unknown case action.");
          return json({ ok: true });
        }
      }
      if (request.method === "GET" && path === "/api/coordination") {
        const result = await db
          .prepare(
            `SELECT r.id,r.case_id,r.requester_id,r.target_official_id,r.target_bureau,r.status,CASE WHEN c.id IN(SELECT id FROM visible) THEN r.reason ELSE 'Details restricted until coordination is approved.' END reason,r.manager_approved_at,r.bureau_approved_at,r.created_at,o.name target_name,CASE WHEN c.id IN(SELECT id FROM visible) THEN c.subject ELSE NULL END subject,c.bureau,CASE WHEN c.id IN(SELECT id FROM visible) THEN i.name ELSE NULL END institution_name,(c.id IN(SELECT id FROM visible)) can_open FROM coordination_requests r JOIN officials o ON o.id=r.target_official_id JOIN cases c ON c.id=r.case_id JOIN institutions i ON i.id=c.institution_id WHERE c.is_demo=? AND (r.requester_id=? OR r.target_official_id=? OR r.requester_id IN(SELECT id FROM team) OR r.target_official_id IN(SELECT id FROM team)) ORDER BY r.created_at DESC LIMIT 30`.replace(
              "SELECT r.id",
              `${s.sql} SELECT r.id`,
            ),
          )
          .bind(...s.args, user.is_demo, user.id, user.id)
          .all();
        const records = await Promise.all(
          result.results.map(async (r) => ({
            ...r,
            can_approve:
              r.status === "Awaiting manager"
                ? await managerFor(
                    db,
                    user,
                    String(r.requester_id),
                    String(r.bureau),
                  )
                : r.status === "Awaiting Bureau"
                  ? await managerFor(
                      db,
                      user,
                      String(r.target_official_id),
                      String(r.target_bureau),
                    )
                  : false,
          })),
        );
        return json({ requests: records });
      }
      const coordinationMatch = path.match(/^\/api\/coordination\/([^/]+)$/);
      if (request.method === "POST" && coordinationMatch) {
        const input = await body(request),
          row = await db
            .prepare(
              `SELECT r.*,c.bureau,c.is_demo FROM coordination_requests r JOIN cases c ON c.id=r.case_id WHERE r.id=? AND c.is_demo=?`,
            )
            .bind(coordinationMatch[1], user.is_demo)
            .first<Record<string, unknown>>();
        if (!row) fail(404, "Request not found.");
        if (input.decision === "revoke") {
          if (row.status !== "Approved")
            fail(409, "Only approved coordination can be revoked.");
          const c = await readable(db, user, String(row.case_id));
          if (!(await mayAct(db, user, c)))
            fail(403, "Only the case owner or manager can revoke access.");
          const reason = textField(input.reason, "Revocation note", 1000, 3),
            stamp = now();
          await db.batch([
            db
              .prepare(
                "UPDATE coordination_requests SET status='Revoked' WHERE id=? AND status='Approved'",
              )
              .bind(row.id),
            db
              .prepare(
                "UPDATE case_grants SET revoked_at=? WHERE case_id=? AND official_id=?",
              )
              .bind(stamp, row.case_id, row.target_official_id),
            event(
              db,
              String(row.case_id),
              "coordination",
              user,
              "Access revoked. " + reason,
              stamp,
            ),
          ]);
          return json({ ok: true });
        }
        if (!["approve", "reject"].includes(String(input.decision)))
          fail(400, "Choose approve or reject.");
        const isFirst = row.status === "Awaiting manager",
          allowed = isFirst
            ? await managerFor(
                db,
                user,
                String(row.requester_id),
                String(row.bureau),
              )
            : row.status === "Awaiting Bureau"
              ? await managerFor(
                  db,
                  user,
                  String(row.target_official_id),
                  String(row.target_bureau),
                )
              : false;
        if (!allowed) fail(403, "This request is not awaiting your approval.");
        const reason = textField(input.reason, "Decision note", 1000, 3),
          accept = input.decision === "approve",
          next = accept
            ? isFirst
              ? "Awaiting Bureau"
              : "Approved"
            : "Rejected",
          stamp = now();
        const approvalColumn = isFirst
          ? "manager_approved_at"
          : "bureau_approved_at";
        const statements = [
          db
            .prepare(
              `INSERT INTO case_events(id,case_id,kind,actor_id,body,created_at) SELECT ?,case_id,'coordination',?,?,? FROM coordination_requests WHERE id=? AND status=?`,
            )
            .bind(
              id("event"),
              user.id,
              `${next}. ${reason}`,
              stamp,
              row.id,
              row.status,
            ),
        ];
        if (next === "Approved")
          statements.push(
            db
              .prepare(
                "INSERT INTO case_grants(case_id,official_id,granted_at) SELECT case_id,target_official_id,? FROM coordination_requests WHERE id=? AND status=? ON CONFLICT(case_id,official_id) DO UPDATE SET revoked_at=NULL,granted_at=excluded.granted_at",
              )
              .bind(stamp, row.id, row.status),
          );
        statements.push(
          db
            .prepare(
              `UPDATE coordination_requests SET status=?,${approvalColumn}=? WHERE id=? AND status=?`,
            )
            .bind(next, accept ? stamp : null, row.id, row.status),
        );
        const updates = await db.batch(statements);
        if (!updates[updates.length - 1].meta.changes)
          fail(409, "This request has already changed.");
        return json({ ok: true });
      }
      if (request.method === "POST" && path === "/api/tags/suggest") {
        if (user.is_demo)
          fail(
            403,
            "Automatic tagging is disabled for public test accounts. Choose tags manually.",
          );
        const input = await body(request),
          content = textField(input.text, "Complaint text", 2500, 20);
        const catalogue = (
          await db
            .prepare("SELECT code,label FROM tags ORDER BY code LIMIT 40")
            .all()
        ).results;
        const language = textField(
          String(input.language || "english"),
          "Language",
          30,
        );
        const bytes = await crypto.subtle.digest(
          "SHA-256",
          new TextEncoder().encode(
            language + content + JSON.stringify(catalogue),
          ),
        );
        const key = [...new Uint8Array(bytes)]
          .map((n) => n.toString(16).padStart(2, "0"))
          .join("");
        const cached = await db
          .prepare(
            "SELECT suggestions FROM tag_cache WHERE cache_key=? AND expires_at>?",
          )
          .bind(key, Math.floor(Date.now() / 1000))
          .first<{ suggestions: string }>();
        if (cached) return json(JSON.parse(cached.suggestions));
        const quota = await db
          .prepare(
            "INSERT INTO inference_usage(official_id,day,calls) VALUES(?,?,1) ON CONFLICT(official_id,day) DO UPDATE SET calls=calls+1 WHERE calls<10",
          )
          .bind(user.id, now().slice(0, 10))
          .run();
        if (!quota.meta.changes)
          fail(
            429,
            "The daily suggestion limit has been reached. Choose tags manually.",
          );
        const result = await env.RELEVANCE.fetch(
          new Request("https://private/tags", {
            method: "POST",
            headers: {
              "content-type": "application/json",
              "x-internal-secret": env.INTERNAL_SECRET,
              "x-actor": JSON.stringify(user),
            },
            body: JSON.stringify({ text: content, catalogue, language }),
          }),
        );
        if (!result.ok) return result;
        const suggestions = await result.json();
        await db.batch([
          db
            .prepare("DELETE FROM tag_cache WHERE expires_at<?")
            .bind(Math.floor(Date.now() / 1000)),
          db
            .prepare(
              "INSERT OR REPLACE INTO tag_cache(cache_key,suggestions,expires_at) VALUES(?,?,?)",
            )
            .bind(
              key,
              JSON.stringify(suggestions),
              Math.floor(Date.now() / 1000) + 604800,
            ),
        ]);
        return json(suggestions);
      }
      return fail(404, "This endpoint does not exist.");
    });
  },
} satisfies ExportedHandler<Env>;
