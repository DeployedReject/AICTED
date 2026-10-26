import { fail } from "../shared";
export async function historyPage(db: D1Database, caseId: string, cursor = "") {
  let date = "~",
    key = "~";
  if (cursor) {
    try {
      const parsed = JSON.parse(atob(cursor));
      date = String(parsed[0]);
      key = String(parsed[1]);
      if (date.length > 40 || key.length > 100) throw Error();
    } catch {
      fail(400, "Invalid history cursor.");
    }
  }
  const result = await db
    .prepare(
      "WITH history AS (SELECT id,case_id,kind,actor_id,body,created_at,actor_name_snapshot actor_name,actor_designation_snapshot designation,actor_bureau_snapshot bureau,is_public FROM case_events WHERE case_id=? UNION ALL SELECT id,case_id,kind,account_id actor_id,CASE WHEN rating IS NOT NULL THEN 'Rating '||rating||'/5. '||body ELSE body END body,created_at,actor_name,'Institution representative' designation,'Institution' bureau,1 is_public FROM institution_events WHERE case_id=?) SELECT * FROM history WHERE created_at<? OR (created_at=? AND id<?) ORDER BY created_at DESC,id DESC LIMIT 31",
    )
    .bind(caseId, caseId, date, date, key)
    .all();
  return {
    results: result.results.slice(0, 30),
    next:
      result.results.length > 30
        ? btoa(
            JSON.stringify([
              result.results[29].created_at,
              result.results[29].id,
            ]),
          )
        : null,
  };
}
