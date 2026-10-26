import { caseNotice } from "./notices";
import type { Official } from "../../packages/shared/types";
import type { Env } from "../shared";
import { body, fail, id, json, now, textField } from "../shared";
import { mayAct, readable } from "./access";
export async function institutionResponse(
  request: Request,
  env: Env,
  user: Official,
  caseId: string,
) {
  const c = await readable(env.DB, user, caseId);
  if (user.role !== "manager" || !(await mayAct(env.DB, user, c)))
    fail(403, "The responsible manager must review this request.");
  const input = await body(request),
    kind = String(input.kind),
    decision = String(input.decision),
    reason = textField(input.reason, "Decision note", 2000, 3);
  if (
    !["cancellation", "escalation"].includes(kind) ||
    !["Approved", "Rejected"].includes(decision)
  )
    fail(400, "Choose a request and decision.");
  if (c.status === "Disposed") fail(409, "This case is already closed.");
  const column =
    kind === "cancellation" ? "cancellation_state" : "institution_escalation";
  if (
    (kind === "cancellation"
      ? c.cancellation_state
      : c.institution_escalation) !== "Awaiting review"
  )
    fail(409, "This request is not awaiting review.");
  const stamp = now(),
    eventKind = kind + "_" + decision.toLowerCase();
  const update =
    kind === "cancellation" && decision === "Approved"
      ? "cancellation_state=?,status='Disposed',escalated=0,institution_escalation=CASE WHEN institution_escalation='Awaiting review' THEN 'Closed with case' ELSE institution_escalation END,intake=CASE WHEN intake='Submitted' THEN 'Rejected' ELSE intake END"
      : kind === "escalation" && decision === "Approved"
        ? "institution_escalation=?,escalated=1"
        : column + "=?";
  const result = await env.DB.batch([
    env.DB.prepare(
      `UPDATE cases SET ${update},updated_at=? WHERE id=? AND ${column}='Awaiting review'`,
    ).bind(decision, stamp, caseId),
    env.DB.prepare(
      "INSERT INTO case_events(id,case_id,kind,actor_id,body,created_at,is_public) SELECT ?,id,?,?,?,?,? FROM cases WHERE id=? AND updated_at=?",
    ).bind(
      id("event"),
      eventKind,
      user.id,
      reason,
      stamp,
      input.is_public === "1" ? 1 : 0,
      caseId,
      stamp,
    ),
  ]);
  if (!result[0].meta.changes)
    fail(409, "The request has already been reviewed.");
  if (kind === "escalation" && decision === "Approved")
    await caseNotice(
      env,
      caseId,
      "escalation",
      "An institutional escalation request was approved.",
    );
  return json({ ok: true });
}
