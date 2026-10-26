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
import { applicationEnv } from "../database/client";
import { mayAct, readable, teamMember } from "../casework/access";
interface Handoff {
  id: string;
  case_id: string;
  requester_id: string;
  target_id: string;
  source_bureau: string;
  target_bureau: string;
  status: string;
  reason: string;
  created_at: string;
}
export default {
  fetch(request: Request, original: Env) {
    const env = applicationEnv(
      original,
      request.headers.get("x-db-generation"),
    );
    return guard(async () => {
      const user = actor(request, env),
        url = new URL(request.url),
        db = env.DB;
      if (user.role !== "manager")
        fail(403, "A designated manager must manage bureau handoffs.");
      if (url.pathname === "/api/handoffs" && request.method === "GET") {
        const cursor = (url.searchParams.get("cursor") || "").slice(0, 100);
        const result = await db
          .prepare(
            `WITH RECURSIVE team(id) AS(SELECT ? UNION SELECT o.id FROM officials o JOIN team t ON o.manager_id=t.id WHERE o.is_demo=? AND o.bureau=?) SELECT h.*,o.name target_name,r.name requester_name FROM handoff_requests h JOIN cases c ON c.id=h.case_id JOIN officials o ON o.id=h.target_id JOIN officials r ON r.id=h.requester_id WHERE c.is_demo=? AND (h.requester_id=? OR (h.target_bureau=? AND h.target_id IN(SELECT id FROM team))) AND h.id<? ORDER BY h.id DESC LIMIT 21`,
          )
          .bind(
            user.id,
            user.is_demo,
            user.bureau,
            user.is_demo,
            user.id,
            user.bureau,
            cursor || "~",
          )
          .all();
        return json({
          requests: result.results.slice(0, 20),
          next: result.results.length > 20 ? result.results[19].id : null,
        });
      }
      const caseMatch = url.pathname.match(/^\/api\/cases\/([^/]+)\/handoff$/);
      if (caseMatch) {
        const caseId = decodeURIComponent(caseMatch[1]),
          c = await readable(db, user, caseId);
        if (request.method === "GET") {
          const result = await db
            .prepare(
              "SELECT h.*,o.name target_name FROM handoff_requests h JOIN officials o ON o.id=h.target_id WHERE h.case_id=? ORDER BY h.created_at DESC LIMIT 20",
            )
            .bind(caseId)
            .all();
          return json({ requests: result.results });
        }
        if (request.method !== "POST") fail(405, "Method not allowed.");
        if (
          !(await mayAct(db, user, c)) ||
          c.intake !== "Approved" ||
          c.status === "Disposed"
        )
          fail(
            403,
            "Only the responsible manager can request a handoff of an active approved case.",
          );
        const input = await body(request),
          targetId = textField(input.official_id, "Receiving official", 80),
          reason = textField(input.reason, "Handoff reason", 1000, 5);
        const target = await db
          .prepare(
            `SELECT ${userColumns} FROM officials WHERE id=? AND is_demo=? AND active=1 AND bureau IN(SELECT code FROM org_units WHERE active=1) AND role IN('official','manager')`,
          )
          .bind(targetId, user.is_demo)
          .first<Official>();
        if (!target || target.bureau === c.bureau)
          fail(
            400,
            "Choose an active official in another bureau. Use team assignment for your own bureau.",
          );
        const requestId = id("handoff"),
          stamp = now();
        const result = await db
          .prepare(
            "INSERT INTO handoff_requests(id,case_id,requester_id,target_id,source_bureau,target_bureau,reason,created_at) SELECT ?,?,?,?,?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM handoff_requests WHERE case_id=? AND status='Awaiting receiving manager')",
          )
          .bind(
            requestId,
            caseId,
            user.id,
            target.id,
            c.bureau,
            target.bureau,
            reason,
            stamp,
            caseId,
          )
          .run();
        if (!result.meta.changes)
          fail(409, "This case already has a pending handoff.");
        return json({ ok: true, id: requestId });
      }
      const decision = url.pathname.match(/^\/api\/handoffs\/([^/]+)$/);
      if (!decision || request.method !== "POST")
        fail(404, "Handoff not found.");
      const record = await db
        .prepare(
          "SELECT h.* FROM handoff_requests h JOIN cases c ON c.id=h.case_id WHERE h.id=? AND c.is_demo=?",
        )
        .bind(decodeURIComponent(decision[1]), user.is_demo)
        .first<Handoff>();
      if (!record) fail(404, "Handoff not found.");
      const input = await body(request),
        choice = String(input.decision),
        reason = textField(input.reason, "Decision note", 1000, 3);
      if (!["Approved", "Rejected", "Cancelled"].includes(choice))
        fail(400, "Choose an approval decision.");
      if (record.status !== "Awaiting receiving manager")
        fail(409, "The handoff has already been decided.");
      if (choice === "Cancelled") {
        if (record.requester_id !== user.id)
          fail(403, "Only the requesting manager can cancel this handoff.");
      } else if (
        record.target_bureau !== user.bureau ||
        !(await teamMember(db, user, record.target_id))
      )
        fail(403, "The receiving official’s manager must decide the handoff.");
      const stamp = now();
      if (choice !== "Approved") {
        const results = await db.batch([
          db
            .prepare(
              "INSERT INTO case_events(id,case_id,kind,actor_id,body,created_at) SELECT ?,case_id,'handoff_decision',?,?,? FROM handoff_requests WHERE id=? AND status='Awaiting receiving manager'",
            )
            .bind(
              id("event"),
              user.id,
              choice + ": " + reason,
              stamp,
              record.id,
            ),
          db
            .prepare(
              "UPDATE handoff_requests SET status=?,decided_at=?,decided_by=? WHERE id=? AND status='Awaiting receiving manager'",
            )
            .bind(choice, stamp, user.id, record.id),
        ]);
        if (!results[1].meta.changes)
          fail(409, "The handoff has already been decided.");
        return json({ ok: true });
      }
      const c = await db
        .prepare("SELECT * FROM cases WHERE id=? AND is_demo=?")
        .bind(record.case_id, user.is_demo)
        .first<{
          id: string;
          bureau: string;
          assigned_to: string;
          created_by: string;
          status: string;
          intake: string;
          updated_at: string;
        }>();
      const target = await db
          .prepare(
            `SELECT ${userColumns} FROM officials WHERE id=? AND is_demo=? AND active=1 AND bureau IN(SELECT code FROM org_units WHERE active=1)`,
          )
          .bind(record.target_id, user.is_demo)
          .first<Official>(),
        requester = await db
          .prepare(
            `SELECT ${userColumns} FROM officials WHERE id=? AND is_demo=? AND active=1`,
          )
          .bind(record.requester_id, user.is_demo)
          .first<Official>();
      if (
        !c ||
        c.bureau !== record.source_bureau ||
        c.intake !== "Approved" ||
        c.status === "Disposed" ||
        !target ||
        target.bureau !== record.target_bureau ||
        !requester ||
        requester.role !== "manager" ||
        !(await mayAct(db, requester, c as never))
      )
        fail(
          409,
          "Case ownership or receiving authority changed. Request a fresh handoff.",
        );
      const statements = [
        db
          .prepare(
            "INSERT INTO case_events(id,case_id,kind,actor_id,body,created_at) SELECT ?,id,'transferred_out',?,?,? FROM cases WHERE id=? AND bureau=? AND assigned_to=? AND updated_at=?",
          )
          .bind(
            id("event"),
            record.requester_id,
            `Receiving manager accepted transfer to ${target.bureau} (${target.id}). ${reason}`,
            stamp,
            c.id,
            c.bureau,
            c.assigned_to,
            c.updated_at,
          ),
        db
          .prepare(
            "UPDATE cases SET bureau=?,assigned_to=?,updated_at=? WHERE id=? AND bureau=? AND assigned_to=? AND updated_at=? AND intake='Approved' AND status<>'Disposed'",
          )
          .bind(
            target.bureau,
            target.id,
            stamp,
            c.id,
            c.bureau,
            c.assigned_to,
            c.updated_at,
          ),
        db
          .prepare(
            "UPDATE handoff_requests SET status='Approved',decided_at=?,decided_by=? WHERE id=? AND status='Awaiting receiving manager' AND EXISTS(SELECT 1 FROM cases WHERE id=? AND updated_at=?)",
          )
          .bind(stamp, user.id, record.id, c.id, stamp),
        db
          .prepare(
            "INSERT INTO case_events(id,case_id,kind,actor_id,body,created_at) SELECT ?,id,'transferred',?,?,? FROM cases WHERE id=? AND updated_at=?",
          )
          .bind(
            id("event"),
            user.id,
            `Transferred from ${c.bureau} (${c.assigned_to}) to ${target.bureau} (${target.id}). ${reason}`,
            stamp,
            c.id,
            stamp,
          ),
      ];
      for (const previous of new Set([c.assigned_to, record.requester_id]))
        statements.push(
          db
            .prepare(
              "INSERT INTO case_grants(case_id,official_id,granted_at) SELECT id,?,? FROM cases WHERE id=? AND updated_at=? ON CONFLICT(case_id,official_id) DO UPDATE SET granted_at=excluded.granted_at,revoked_at=NULL",
            )
            .bind(previous, stamp, c.id, stamp),
        );
      const result = await db.batch(statements);
      if (!result[1].meta.changes)
        fail(409, "The case changed while this handoff was being approved.");
      return json({ ok: true });
    });
  },
} satisfies ExportedHandler<Env>;
