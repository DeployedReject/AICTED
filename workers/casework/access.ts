import type { Official, CaseRecord } from "../../packages/shared/types";
import { fail } from "../shared";

export function scope(user: Official) {
  return {
    sql: `WITH RECURSIVE team(id) AS (
   SELECT id FROM officials WHERE id=? AND is_demo=?
   UNION SELECT o.id FROM officials o JOIN team t ON o.manager_id=t.id WHERE ?='manager' AND o.is_demo=?
  ), visible(id) AS (
   SELECT id FROM cases WHERE is_demo=? AND assigned_to IN(SELECT id FROM team)
   UNION SELECT id FROM cases WHERE is_demo=? AND created_by=?
   UNION SELECT g.case_id FROM case_grants g JOIN cases c ON c.id=g.case_id WHERE g.official_id=? AND g.revoked_at IS NULL AND c.is_demo=?
  )`,
    args: [
      user.id,
      user.is_demo,
      user.role,
      user.is_demo,
      user.is_demo,
      user.is_demo,
      user.id,
      user.id,
      user.is_demo,
    ],
  };
}
export const caseSelect = `SELECT c.*,i.name AS institution_name,i.permanent_id,i.city,i.state,i.region,o.name AS assigned_name FROM cases c JOIN institutions i ON i.id=c.institution_id JOIN officials o ON o.id=c.assigned_to`;
export function caseRow(row: Record<string, unknown>): CaseRecord {
  return {
    ...row,
    tags: JSON.parse(String(row.tags || "[]")),
  } as unknown as CaseRecord;
}
export async function readable(db: D1Database, user: Official, caseId: string) {
  const s = scope(user);
  const row = await db
    .prepare(
      `${s.sql} ${caseSelect} WHERE c.id=? AND c.id IN(SELECT id FROM visible)`,
    )
    .bind(...s.args, caseId)
    .first<Record<string, unknown>>();
  if (!row) fail(404, "Case not found or access has not been shared with you.");
  return caseRow(row);
}
export async function teamMember(db: D1Database, user: Official, id: string) {
  const s = scope(user);
  return Boolean(
    await db
      .prepare(`${s.sql} SELECT id FROM team WHERE id=?`)
      .bind(...s.args, id)
      .first(),
  );
}
export async function mayAct(db: D1Database, user: Official, c: CaseRecord) {
  return (
    c.assigned_to === user.id ||
    (user.role === "manager" &&
      c.bureau === user.bureau &&
      (await teamMember(db, user, c.assigned_to)))
  );
}
export async function managerFor(
  db: D1Database,
  user: Official,
  officialId: string,
  bureau: string,
) {
  return (
    user.role === "manager" &&
    user.id !== officialId &&
    user.bureau === bureau &&
    (await teamMember(db, user, officialId))
  );
}

// Workload reports deliberately exclude case grants and unrelated submissions.
export function reportScope(user: Official) {
  const team = user.role === "manager";
  const bureau = team && user.report_scope === "bureau";
  return {
    sql: `WITH RECURSIVE reporting(id) AS (
   SELECT id FROM officials WHERE id=? AND is_demo=?
   UNION SELECT o.id FROM officials o JOIN reporting t ON o.manager_id=t.id WHERE ?=1 AND o.is_demo=? AND o.bureau=?
  ), measured(id) AS (SELECT id FROM cases WHERE is_demo=? AND (assigned_to IN(SELECT id FROM reporting) OR (?=1 AND bureau=?)))`,
    args: [
      user.id,
      user.is_demo,
      team ? 1 : 0,
      user.is_demo,
      user.bureau,
      user.is_demo,
      bureau ? 1 : 0,
      user.bureau,
    ],
    label: bureau
      ? "Bureau workload"
      : team
        ? "Your reporting team"
        : "Your assigned cases",
  };
}
