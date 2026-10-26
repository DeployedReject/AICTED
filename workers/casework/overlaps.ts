import type { Official } from "../../packages/shared/types";
import type { Env } from "../shared";
import { fail, json } from "../shared";
import { scope } from "./access";
export async function overlaps(env: Env, user: Official, cursor = "") {
  const s = scope(user);
  let caseId = "~",
    bureau = "";
  if (cursor) {
    try {
      const parsed = JSON.parse(atob(cursor));
      caseId = String(parsed[0]);
      bureau = String(parsed[1]);
      if (caseId.length > 100 || bureau.length > 80) throw Error();
    } catch {
      fail(400, "Invalid overlap cursor.");
    }
  }

  const result = await env.DB.prepare(
    `${s.sql} SELECT c.id case_id,c.subject,i.name institution_name,i.permanent_id,c.bureau,other.bureau other_bureau,COUNT(DISTINCT other.id) other_cases,MAX(CASE WHEN EXISTS(SELECT 1 FROM json_each(c.tags) own JOIN json_each(other.tags) tag ON own.value=tag.value) THEN 1 ELSE 0 END) matching_categories FROM cases c JOIN institutions i ON i.id=c.institution_id JOIN cases other ON other.institution_id=c.institution_id AND other.is_demo=c.is_demo AND other.bureau<>c.bureau AND other.intake='Approved' AND other.status<>'Disposed' WHERE c.id IN(SELECT id FROM visible) AND c.intake='Approved' AND c.status<>'Disposed' AND (c.id<? OR (c.id=? AND other.bureau>?)) AND NOT EXISTS(SELECT 1 FROM case_relations r WHERE r.case_id=MIN(c.id,other.id) AND r.related_case_id=MAX(c.id,other.id) AND r.kind='Unrelated') GROUP BY c.id,i.id,other.bureau ORDER BY c.id DESC,other.bureau ASC LIMIT 26`,
  )
    .bind(...s.args, caseId, caseId, bureau)
    .all();
  return json({
    overlaps: result.results.slice(0, 25),
    next:
      result.results.length > 25
        ? btoa(
            JSON.stringify([
              result.results[24].case_id,
              result.results[24].other_bureau,
            ]),
          )
        : null,
  });
}
