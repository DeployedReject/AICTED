import type { Official } from "../../packages/shared/types";
import type { Env } from "../shared";
import { json } from "../shared";
import { scope } from "./access";
export async function overlaps(env: Env, user: Official) {
  const s = scope(user);
  const result = await env.DB.prepare(
    `${s.sql} SELECT c.id case_id,c.subject,i.name institution_name,i.permanent_id,c.bureau,other.bureau other_bureau,COUNT(DISTINCT other.id) other_cases,MAX(EXISTS(SELECT 1 FROM json_each(c.tags) own JOIN json_each(other.tags) tag ON own.value=tag.value)) matching_categories FROM cases c JOIN institutions i ON i.id=c.institution_id JOIN cases other ON other.institution_id=c.institution_id AND other.is_demo=c.is_demo AND other.bureau<>c.bureau AND other.intake='Approved' AND other.status<>'Disposed' WHERE c.id IN(SELECT id FROM visible) AND c.intake='Approved' AND c.status<>'Disposed' AND NOT EXISTS(SELECT 1 FROM case_relations r WHERE r.case_id=MIN(c.id,other.id) AND r.related_case_id=MAX(c.id,other.id) AND r.kind='Unrelated') GROUP BY c.id,other.bureau ORDER BY c.updated_at DESC LIMIT 25`,
  )
    .bind(...s.args)
    .all();
  return json({ overlaps: result.results });
}
