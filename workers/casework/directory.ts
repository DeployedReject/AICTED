import type { Official } from "../../packages/shared/types";
import type { Env } from "../shared";
import { json, userColumns } from "../shared";
import { scope } from "./access";
export async function directory(url: URL, env: Env, user: Official) {
  const query = (url.searchParams.get("q") || "").trim().slice(0, 80);
  if (query.length < 2) return json({ officials: [], more: false });
  const tokens = query.match(/[\p{L}\p{N}]+/gu)?.slice(0, 4) || [];
  if (!tokens.length) return json({ officials: [], more: false });
  const match = tokens.map((t) => '"' + t + '"*').join(" AND "),
    kind = url.searchParams.get("kind") || "recipient",
    role = url.searchParams.get("role") === "manager" ? "manager" : null,
    bureau = (url.searchParams.get("bureau") || "").slice(0, 80),
    exclude = (url.searchParams.get("exclude_bureau") || "").slice(0, 80),
    s = scope(user);
  const conditions = [
      "official_search MATCH ?",
      "o.is_demo=?",
      "o.active=1",
      "o.role<>'it'",
    ],
    args: unknown[] = [match, user.is_demo];
  if (role) conditions.push("o.role='manager'");
  if (bureau) {
    conditions.push("o.bureau=?");
    args.push(bureau);
  }
  if (exclude) {
    conditions.push("o.bureau<>?");
    args.push(exclude);
  }
  if (kind === "team") {
    conditions.push("o.id IN(SELECT id FROM team)");
    if (user.role !== "manager") return json({ officials: [], more: false });
  }
  const rows = await env.DB.prepare(
    `${kind === "team" ? s.sql : ""} SELECT ${userColumns
      .split(",")
      .map((c) => "o." + c)
      .join(
        ",",
      )} FROM official_search JOIN officials o ON o.rowid=official_search.rowid WHERE ${conditions.join(" AND ")} ORDER BY rank LIMIT 21`,
  )
    .bind(...(kind === "team" ? s.args : []), ...args)
    .all();
  return json({
    officials: rows.results.slice(0, 20),
    more: rows.results.length > 20,
  });
}
