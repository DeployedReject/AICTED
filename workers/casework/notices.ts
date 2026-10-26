import type { Env } from "../shared";
import { now } from "../shared";
export async function caseNotice(
  env: Env,
  caseId: string,
  kind: string,
  message: string,
  key = crypto.randomUUID(),
) {
  const stamp = now();
  await env.DB.prepare(
    "INSERT INTO case_notices(id,case_id,official_id,kind,body,created_at) SELECT ?,c.id,o.id,?,?,? FROM cases c JOIN officials assigned ON assigned.id=c.assigned_to JOIN officials o ON o.id=c.assigned_to OR o.id=assigned.manager_id WHERE c.id=? AND o.active=1 AND o.is_demo=c.is_demo ON CONFLICT(id) DO NOTHING".replace(
      "SELECT ?,c.id",
      "SELECT ?||'-'||o.id,c.id",
    ),
  )
    .bind("notice-" + stamp + "-" + key, kind, message, stamp, caseId)
    .run();
}
export async function overlapNotices(env: Env, caseId: string) {
  const stamp = now();
  await env.DB.prepare(
    "INSERT INTO case_notices(id,case_id,official_id,kind,body,created_at) SELECT DISTINCT 'overlap-'||MIN(c.id,other.id)||'-'||MAX(c.id,other.id)||'-'||c.id||'-'||o.id,c.id,o.id,'overlap','Potential bureau overlap. Review the overlap details and request coordination if needed.',? FROM cases c JOIN cases other ON other.institution_id=c.institution_id AND other.is_demo=c.is_demo AND other.bureau<>c.bureau JOIN officials assigned ON assigned.id=c.assigned_to JOIN officials o ON o.id=c.assigned_to OR o.id=assigned.manager_id WHERE (c.id=? OR other.id=?) AND c.intake='Approved' AND other.intake='Approved' AND c.status<>'Disposed' AND other.status<>'Disposed' AND o.active=1 AND o.is_demo=c.is_demo AND NOT EXISTS(SELECT 1 FROM case_relations r WHERE r.case_id=MIN(c.id,other.id) AND r.related_case_id=MAX(c.id,other.id) AND r.kind='Unrelated') LIMIT 50 ON CONFLICT(id) DO NOTHING",
  )
    .bind(stamp, caseId, caseId)
    .run();
}
